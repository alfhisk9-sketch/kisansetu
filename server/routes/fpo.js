import { Router } from "express";
import { db } from "../db.js";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/:id", (req, res) => {
  const fpo = db.prepare(`SELECT * FROM fpos WHERE id = ?`).get(req.params.id);
  if (!fpo) return res.status(404).json({ error: "FPO not found" });
  res.json(fpo);
});

// MODULE 13: FPO Aggregation summary — individual farmer supply rolled up
router.get("/:id/aggregation", (req, res) => {
  const fpo = db.prepare(`SELECT * FROM fpos WHERE id = ?`).get(req.params.id);
  if (!fpo) return res.status(404).json({ error: "FPO not found" });

  const farmers = db.prepare(`SELECT * FROM farmers WHERE fpo_id = ?`).all(fpo.id);
  const farmerIds = farmers.map((f) => f.id);

  const farmerLots = farmerIds.length
    ? db.prepare(`SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE l.owner_type='farmer' AND l.owner_id IN (${farmerIds.map(() => "?").join(",")}) AND l.status != 'Withdrawn'`).all(...farmerIds)
    : [];

  const byCropGrade = {};
  for (const lot of farmerLots) {
    const key = `${lot.crop_name}|${lot.grade || "Ungraded"}`;
    byCropGrade[key] = (byCropGrade[key] || 0) + lot.quantity_quintals;
  }

  const totalAvailable = farmerLots.reduce((s, l) => s + l.quantity_quintals, 0);
  const fpoLots = db.prepare(`SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE l.owner_type='fpo' AND l.owner_id = ?`).all(fpo.id);

  res.json({
    fpo,
    memberFarmerCount: farmers.length,
    individualLots: farmerLots,
    totalAvailableQuintals: Math.round(totalAvailable * 100) / 100,
    breakdownByCropAndGrade: Object.entries(byCropGrade).map(([k, v]) => {
      const [crop, grade] = k.split("|");
      return { crop, grade, quantityQuintals: Math.round(v * 100) / 100 };
    }),
    aggregatedLots: fpoLots,
  });
});

// Create an aggregated lot from selected individual farmer lots
router.post("/:id/aggregate-lot", (req, res) => {
  const { sourceLotIds, cropId, grade, location, district, expectedPrice, minAcceptablePrice, harvestDate, availableFrom } = req.body;
  if (!sourceLotIds?.length) return res.status(400).json({ error: "sourceLotIds is required" });
  if (!assertRequired(req, res, ["cropId", "location", "district"])) return;

  const sourceLots = db.prepare(`SELECT * FROM lots WHERE id IN (${sourceLotIds.map(() => "?").join(",")})`).all(...sourceLotIds);
  const totalQty = sourceLots.reduce((s, l) => s + l.quantity_quintals, 0);

  const lotId = `LOT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;
  db.prepare(`INSERT INTO lots (id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status, is_aggregated, source_lot_ids)
    VALUES (?, 'fpo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Open for offers', 1, ?)`).run(
    lotId, req.params.id, cropId, sourceLots[0]?.variety || null, totalQty, grade || null, location, district, harvestDate || null, availableFrom || null,
    expectedPrice ?? null, minAcceptablePrice ?? null, JSON.stringify(sourceLotIds)
  );
  // mark source lots as aggregated/closed to avoid double counting
  for (const sl of sourceLotIds) db.prepare(`UPDATE lots SET status = 'Closed' WHERE id = ?`).run(sl);

  res.status(201).json(db.prepare(`SELECT * FROM lots WHERE id = ?`).get(lotId));
});

export default router;
