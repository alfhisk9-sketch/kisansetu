import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { nanoid } from "nanoid";
import { computeGrade, compareStoreVsSellNow, calcMarketCharges } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", async (req, res) => {
  const { ownerId, ownerType, status } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      let q = supabase.from("lots").select("*, crops(name)").order("created_at", { ascending: false });
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (ownerType) q = q.eq("owner_type", ownerType);
      if (status) q = q.eq("status", status);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const mapped = (data || []).map((l) => ({
        ...l,
        crop_name: l.crops?.name || "Produce"
      }));
      return res.json(mapped);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  let query = `SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE 1=1`;
  const params = [];
  if (ownerId) { query += ` AND l.owner_id = ?`; params.push(ownerId); }
  if (ownerType) { query += ` AND l.owner_type = ?`; params.push(ownerType); }
  if (status) { query += ` AND l.status = ?`; params.push(status); }
  query += ` ORDER BY l.created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

router.get("/:id", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const { data: lot, error: lErr } = await supabase
        .from("lots")
        .select("*, crops(name)")
        .eq("id", req.params.id)
        .maybeSingle();

      if (lErr || !lot) return res.status(404).json({ error: "Lot not found" });

      const { data: grades } = await supabase
        .from("quality_grades")
        .select("*")
        .eq("lot_id", req.params.id);

      const { data: offers } = await supabase
        .from("offers")
        .select("*, buyers(name)")
        .eq("lot_id", req.params.id)
        .order("created_at", { ascending: false });

      const mappedOffers = (offers || []).map((o) => ({
        ...o,
        buyer_name: o.buyers?.name || "Buyer"
      }));

      return res.json({
        ...lot,
        crop_name: lot.crops?.name || "Produce",
        grades: grades || [],
        offers: mappedOffers
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  const lot = db.prepare(`SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE l.id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ error: "Lot not found" });
  const grades = db.prepare(`SELECT * FROM quality_grades WHERE lot_id = ?`).all(lot.id);
  const offers = db.prepare(`SELECT o.*, b.name as buyer_name FROM offers o JOIN buyers b ON b.id = o.buyer_id WHERE o.lot_id = ? ORDER BY o.created_at DESC`).all(lot.id);
  res.json({ ...lot, grades, offers });
});

router.post("/", async (req, res) => {
  if (!assertRequired(req, res, ["ownerType", "ownerId", "cropId", "quantityQuintals", "location", "district"])) return;
  const b = req.body;
  const lotId = b.id || `LOT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const { data, error } = await supabase
        .from("lots")
        .insert({
          id: lotId,
          owner_type: b.ownerType,
          owner_id: b.ownerId,
          crop_id: b.cropId,
          variety: b.variety || null,
          quantity_quintals: Number(b.quantityQuintals),
          grade: b.grade || "A",
          location: b.location,
          district: b.district,
          harvest_date: b.harvestDate || null,
          available_from: b.availableFrom || null,
          expected_price: Number(b.expectedPrice) || 0,
          min_acceptable_price: b.minAcceptablePrice ? Number(b.minAcceptablePrice) : null,
          storage_available: Boolean(b.storageAvailable),
          status: "Open for offers",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  db.prepare(`INSERT INTO lots (id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    lotId, b.ownerType, b.ownerId, b.cropId, b.variety || null, b.quantityQuintals, b.grade || null,
    b.location, b.district, b.harvestDate || null, b.availableFrom || null, b.expectedPrice || null,
    b.minAcceptablePrice || null, b.storageAvailable ? 1 : 0, "Open for offers"
  );
  res.status(201).json(db.prepare(`SELECT * FROM lots WHERE id = ?`).get(lotId));
});

router.patch("/:id/status", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: existing } = await supabase.from("lots").select("id").eq("id", req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: "Lot not found" });
    if (!assertRequired(req, res, ["status"])) return;

    const { status } = req.body;
    const { data, error } = await supabase
      .from("lots")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  const db = getDb();
  const existing = db.prepare(`SELECT id FROM lots WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lot not found" });
  if (!assertRequired(req, res, ["status"])) return;
  const { status } = req.body;
  db.prepare(`UPDATE lots SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json(db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.id));
});

router.post("/:id/grade", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: lot } = await supabase.from("lots").select("id").eq("id", req.params.id).maybeSingle();
    if (!lot) return res.status(404).json({ error: "Lot not found" });
    if (!assertRequired(req, res, ["sizeRating", "moistureRating", "damagePct", "foreignMaterialPct", "appearanceRating"])) return;
    const { sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating, verifiedBy } = req.body;
    const grade = computeGrade({ sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating });
    const gid = nanoid(10);

    await supabase.from("quality_grades").insert({
      id: gid,
      lot_id: req.params.id,
      grade,
      size_rating: sizeRating,
      moisture_rating: moistureRating,
      damage_pct: Number(damagePct),
      foreign_material_pct: Number(foreignMaterialPct),
      appearance_rating: appearanceRating,
      verified_by: verifiedBy || null,
      verified: Boolean(verifiedBy),
      notes: req.body.notes || null,
      created_at: new Date().toISOString()
    });

    await supabase.from("lots").update({ grade }).eq("id", req.params.id);
    return res.status(201).json({ grade, id: gid });
  }

  const db = getDb();
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

router.get("/:id/storage-decision", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const { storageId, storageDays } = req.query;

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: lot } = await supabase.from("lots").select("*").eq("id", req.params.id).maybeSingle();
    if (!lot) return res.status(404).json({ error: "Lot not found" });

    const { data: storage } = await supabase.from("storage_facilities").select("*").eq("id", storageId).maybeSingle();
    if (!storage) return res.status(400).json({ error: "storageId is required and must exist" });

    const days = Number(storageDays) || 14;
    const { data: series } = await supabase
      .from("market_prices")
      .select("date, modal_price")
      .eq("crop_id", lot.crop_id)
      .order("date", { ascending: true });

    const prices = series || [];
    const latest = prices[prices.length - 1]?.modal_price || lot.expected_price || 0;
    const recent = prices.slice(-14);
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
      storageCostPerDayPerQuintal: Number(storage.cost_per_day_per_quintal),
      marketChargesOnFuturePrice: marketChargesOnFuture,
    });

    return res.json({
      lotId: lot.id,
      currentPrice: latest,
      projectedFuturePrice,
      storageDays: days,
      storageFacility: storage.name,
      storageCostPerDayPerQuintal: storage.cost_per_day_per_quintal,
      ...comparison,
      disclaimer: "Projected future price is a scenario estimate based on the recent 14-day trend — not a guaranteed price.",
    });
  }

  const db = getDb();
  const lot = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ error: "Lot not found" });
  const storage = db.prepare(`SELECT * FROM storage_facilities WHERE id = ?`).get(storageId);
  if (!storage) return res.status(400).json({ error: "storageId is required and must exist" });

  const days = Number(storageDays) || 14;
  const series = db.prepare(`SELECT date, modal_price FROM market_prices WHERE crop_id = ? ORDER BY date ASC`).all(lot.crop_id);
  const latest = series[series.length - 1]?.modal_price || lot.expected_price || 0;
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
