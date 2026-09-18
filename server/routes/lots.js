import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { computeGrade, compareStoreVsSellNow, calcMarketCharges } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", (req, res) => {
  const { ownerId, ownerType, status } = req.query;
  let query = `SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE 1=1`;
  const params = [];
  if (ownerId) { query += ` AND l.owner_id = ?`; params.push(ownerId); }
  if (ownerType) { query += ` AND l.owner_type = ?`; params.push(ownerType); }
  if (status) { query += ` AND l.status = ?`; params.push(status); }
  query += ` ORDER BY l.created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

router.get("/:id", (req, res) => {
  const lot = db.prepare(`SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE l.id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ error: "Lot not found" });
  const grades = db.prepare(`SELECT * FROM quality_grades WHERE lot_id = ?`).all(lot.id);
  const offers = db.prepare(`SELECT o.*, b.name as buyer_name FROM offers o JOIN buyers b ON b.id = o.buyer_id WHERE o.lot_id = ? ORDER BY o.created_at DESC`).all(lot.id);
  res.json({ ...lot, grades, offers });
});

router.post("/", (req, res) => {
  if (!assertRequired(req, res, ["ownerType", "ownerId", "cropId", "quantityQuintals", "location", "district"])) return;
  const b = req.body;
  const lotId = b.id || `LOT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;
  db.prepare(`INSERT INTO lots (id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    lotId, b.ownerType, b.ownerId, b.cropId, b.variety || null, b.quantityQuintals, b.grade || null,
    b.location, b.district, b.harvestDate || null, b.availableFrom || null, b.expectedPrice || null,
    b.minAcceptablePrice || null, b.storageAvailable ? 1 : 0, "Open for offers"
  );
  res.status(201).json(db.prepare(`SELECT * FROM lots WHERE id = ?`).get(lotId));
});

router.patch("/:id/status", (req, res) => {
  // Bug #3 fix: existence check before UPDATE — previously an unknown id
  // silently affected 0 rows and the follow-up SELECT returned undefined,
  // sending a 200 with an empty body (which crashes the client's res.json()).
  const existing = db.prepare(`SELECT id FROM lots WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lot not found" });
  if (!assertRequired(req, res, ["status"])) return;
  const { status } = req.body;
  db.prepare(`UPDATE lots SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json(db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.id));
});

// MODULE 7: Quality grading — transparent, manual, rule-based (no computer vision)
router.post("/:id/grade", (req, res) => {
  // Bug #5 fix: grading a nonexistent lot previously returned 201 as if it
  // succeeded, creating an orphaned quality_grades row.
  const lot = db.prepare(`SELECT id FROM lots WHERE id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ error: "Lot not found" });
  if (!assertRequired(req, res, ["sizeRating", "moistureRating", "damagePct", "foreignMaterialPct", "appearanceRating"])) return;
  const { sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating, verifiedBy } = req.body;
  const grade = computeGrade({ sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating });
  const gid = nanoid(10);
  db.prepare(`INSERT INTO quality_grades (id, lot_id, grade, size_rating, moisture_rating, damage_pct, foreign_material_pct, appearance_rating, verified_by, verified, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(gid, req.params.id, grade, sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating, verifiedBy || null, verifiedBy ? 1 : 0, req.body.notes || null);
  db.prepare(`UPDATE lots SET grade = ? WHERE id = ?`).run(grade, req.params.id);
  res.status(201).json({ grade, id: gid });
});

// MODULE 10: Sell now vs. store and sell later
router.get("/:id/storage-decision", (req, res) => {
  const lot = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ error: "Lot not found" });
  const { storageId, storageDays } = req.query;
  const storage = db.prepare(`SELECT * FROM storage_facilities WHERE id = ?`).get(storageId);
  if (!storage) return res.status(400).json({ error: "storageId is required and must exist" });

  const days = Number(storageDays) || 14;
  const series = db.prepare(`SELECT date, modal_price FROM market_prices WHERE crop_id = ? ORDER BY date ASC`).all(lot.crop_id);
  const latest = series[series.length - 1]?.modal_price || lot.expected_price || 0;

  // Seasonal projection = simple linear extrapolation of the last 14 days' average daily change,
  // explicitly framed as a scenario estimate, not a prediction guarantee.
  const recent = series.slice(-14);
  let avgDailyChange = 0;
  if (recent.length > 1) {
    avgDailyChange = (recent[recent.length - 1].modal_price - recent[0].modal_price) / recent.length;
  }
  const projectedFuturePrice = Math.round(latest + avgDailyChange * days);
  const marketChargesOnFuture = calcMarketCharges(projectedFuturePrice);
  const currentMarketCharges = calcMarketCharges(latest);

  const currentNet = latest - currentMarketCharges;
  const comparison = compareStoreVsSellNow({
    currentNetRealization: currentNet,
    projectedFuturePrice,
    storageDays: days,
    storageCostPerDayPerQuintal: storage.cost_per_day_per_quintal,
    marketChargesOnFuturePrice: marketChargesOnFuture,
  });

  res.json({
    lotId: lot.id,
    currentPrice: latest,
    projectedFuturePrice,
    storageDays: days,
    storageFacility: storage.name,
    storageCostPerDayPerQuintal: storage.cost_per_day_per_quintal,
    ...comparison,
    disclaimer: "Projected future price is a scenario estimate based on the recent 14-day trend — not a guaranteed price.",
  });
});

export default router;
