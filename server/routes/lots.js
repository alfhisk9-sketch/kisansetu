import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { nanoid } from "nanoid";
import { computeGrade, compareStoreVsSellNow, calcMarketCharges } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";
import { AUTHORITATIVE_CROPS_CATALOG } from "../services/cropMasterService.js";

const router = Router();

function useSupabase() {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return isProduction || hasSupabaseConfig;
}

router.get("/", async (req, res) => {
  const { ownerId, ownerType, status } = req.query;
  const catalogMap = new Map(AUTHORITATIVE_CROPS_CATALOG.map(c => [c.crop_id, c.name]));

  if (useSupabase()) {
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
        crop_name: l.crops?.name || catalogMap.get(l.crop_id) || "Produce"
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
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(r => ({ ...r, crop_name: r.crop_name || catalogMap.get(r.crop_id) || "Produce" })));
});

router.get("/:id", async (req, res) => {
  const catalogMap = new Map(AUTHORITATIVE_CROPS_CATALOG.map(c => [c.crop_id, c.name]));

  if (useSupabase()) {
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
        crop_name: lot.crops?.name || catalogMap.get(lot.crop_id) || "Produce",
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
  res.json({ ...lot, crop_name: lot.crop_name || catalogMap.get(lot.crop_id) || "Produce", grades, offers });
});

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const ownerType = b.ownerType || b.owner_type || (b.farmer_id ? "farmer" : "farmer");
    const ownerId = b.ownerId || b.owner_id || b.farmer_id;
    const cropId = b.cropId || b.crop_id;
    const quantityQuintals = Number(b.quantityQuintals !== undefined ? b.quantityQuintals : (b.quantity_quintals !== undefined ? b.quantity_quintals : b.quantity));
    const location = b.location || b.village;
    const district = b.district;

    if (!ownerId || !cropId || !quantityQuintals || !location || !district) {
      return res.status(400).json({
        error: "Missing required lot fields. Required: ownerId (or farmer_id), cropId (or crop_id), quantityQuintals, location, district"
      });
    }

    if (!cropId.startsWith("crop-")) {
      return res.status(400).json({ error: `Invalid cropId '${cropId}'. Must be a canonical crop ID (e.g. crop-cotton)` });
    }

    const catalogItem = AUTHORITATIVE_CROPS_CATALOG.find(c => c.crop_id === cropId);
    const lotId = b.id || `LOT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;

    if (useSupabase()) {
      const supabase = getSupabaseAdmin();
      if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

      const { data, error } = await supabase
        .from("lots")
        .insert({
          id: lotId,
          owner_type: ownerType,
          owner_id: ownerId,
          crop_id: cropId,
          variety: b.variety || null,
          quantity_quintals: quantityQuintals,
          grade: b.grade || "A",
          location: location,
          district: district,
          harvest_date: b.harvestDate || b.harvest_date || null,
          available_from: b.availableFrom || b.available_from || null,
          expected_price: Number(b.expectedPrice || b.expected_price || 0),
          min_acceptable_price: b.minAcceptablePrice !== undefined ? Number(b.minAcceptablePrice) : (b.min_acceptable_price !== undefined ? Number(b.min_acceptable_price) : null),
          storage_available: Boolean(b.storageAvailable !== undefined ? b.storageAvailable : b.storage_available),
          status: "Open for offers",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error("[POST /api/lots supabase error]:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({
        ...data,
        crop_name: catalogItem?.name || "Produce"
      });
    }

    const db = getDb();
    db.prepare(`INSERT INTO lots (id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      lotId, ownerType, ownerId, cropId, b.variety || null, quantityQuintals, b.grade || "A",
      location, district, b.harvestDate || b.harvest_date || null, b.availableFrom || b.available_from || null,
      Number(b.expectedPrice || b.expected_price || 0),
      b.minAcceptablePrice ? Number(b.minAcceptablePrice) : null,
      b.storageAvailable ? 1 : 0, "Open for offers"
    );
    const row = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(lotId);
    return res.status(201).json({ ...row, crop_name: catalogItem?.name || "Produce" });
  } catch (err) {
    console.error("[POST /api/lots unhandled error]:", err);
    return res.status(500).json({ error: err.message || "Failed to create produce lot" });
  }
});

router.put("/:id", async (req, res) => {
  const b = req.body || {};

  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: existing, error: findErr } = await supabase.from("lots").select("*").eq("id", req.params.id).maybeSingle();
    if (findErr || !existing) return res.status(404).json({ error: "Lot not found" });

    const updates = {
      updated_at: new Date().toISOString()
    };
    if (b.cropId || b.crop_id) updates.crop_id = b.cropId || b.crop_id;
    if (b.variety !== undefined) updates.variety = b.variety;
    if (b.quantityQuintals !== undefined || b.quantity_quintals !== undefined) {
      updates.quantity_quintals = Number(b.quantityQuintals !== undefined ? b.quantityQuintals : b.quantity_quintals);
    }
    if (b.grade !== undefined) updates.grade = b.grade;
    if (b.location !== undefined) updates.location = b.location;
    if (b.district !== undefined) updates.district = b.district;
    if (b.expectedPrice !== undefined || b.expected_price !== undefined) {
      updates.expected_price = Number(b.expectedPrice !== undefined ? b.expectedPrice : b.expected_price);
    }
    if (b.minAcceptablePrice !== undefined || b.min_acceptable_price !== undefined) {
      updates.min_acceptable_price = Number(b.minAcceptablePrice !== undefined ? b.minAcceptablePrice : b.min_acceptable_price);
    }
    if (b.status !== undefined) updates.status = b.status;

    const { data, error } = await supabase
      .from("lots")
      .update(updates)
      .eq("id", req.params.id)
      .select("*, crops(name)")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({
      ...data,
      crop_name: data.crops?.name || AUTHORITATIVE_CROPS_CATALOG.find(c => c.crop_id === data.crop_id)?.name || "Produce"
    });
  }

  const db = getDb();
  const existing = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lot not found" });

  const cropId = b.cropId || b.crop_id || existing.crop_id;
  const variety = b.variety !== undefined ? b.variety : existing.variety;
  const qty = b.quantityQuintals !== undefined ? Number(b.quantityQuintals) : existing.quantity_quintals;
  const grade = b.grade !== undefined ? b.grade : existing.grade;
  const loc = b.location !== undefined ? b.location : existing.location;
  const dist = b.district !== undefined ? b.district : existing.district;
  const price = b.expectedPrice !== undefined ? Number(b.expectedPrice) : existing.expected_price;

  db.prepare(`UPDATE lots SET crop_id = ?, variety = ?, quantity_quintals = ?, grade = ?, location = ?, district = ?, expected_price = ? WHERE id = ?`)
    .run(cropId, variety, qty, grade, loc, dist, price, req.params.id);

  const updated = db.prepare(`SELECT l.*, c.name as crop_name FROM lots l JOIN crops c ON c.id = l.crop_id WHERE l.id = ?`).get(req.params.id);
  res.json(updated);
});

router.patch("/:id/status", async (req, res) => {
  if (useSupabase()) {
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
  if (useSupabase()) {
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
  const { storageId, storageDays } = req.query;

  if (useSupabase()) {
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
