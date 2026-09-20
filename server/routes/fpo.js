import { Router } from "express";
import { db } from "../db.js";
import { assertRequired } from "../lib/validate.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

function useSupabase() {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return isProduction || hasSupabaseConfig;
}

router.get("/:id", async (req, res) => {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data, error } = await supabase
        .from("fpos")
        .select("*")
        .or(`id.eq.${req.params.id},user_id.eq.${req.params.id}`)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "FPO not found" });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const fpo = db.prepare(`SELECT * FROM fpos WHERE id = ? OR user_id = ?`).get(req.params.id, req.params.id);
  if (!fpo) return res.status(404).json({ error: "FPO not found" });
  res.json(fpo);
});

// MODULE 13: FPO Aggregation summary — individual farmer supply rolled up
router.get("/:id/aggregation", async (req, res) => {
  if (useSupabase()) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: fpo } = await supabase
        .from("fpos")
        .select("*")
        .or(`id.eq.${req.params.id},user_id.eq.${req.params.id}`)
        .maybeSingle();
      if (!fpo) return res.status(404).json({ error: "FPO not found" });

      const { data: farmers } = await supabase.from("farmers").select("*").eq("fpo_id", fpo.id);
      const farmerList = farmers || [];
      const farmerIds = farmerList.map((f) => f.id);

      let farmerLots = [];
      if (farmerIds.length > 0) {
        const { data: lotsData } = await supabase
          .from("lots")
          .select("*, crops (name)")
          .eq("owner_type", "farmer")
          .in("owner_id", farmerIds)
          .neq("status", "Withdrawn");

        farmerLots = (lotsData || []).map((l) => ({
          ...l,
          crop_name: l.crops?.name,
        }));
      }

      const byCropGrade = {};
      for (const lot of farmerLots) {
        const key = `${lot.crop_name || "Crop"}|${lot.grade || "Ungraded"}`;
        byCropGrade[key] = (byCropGrade[key] || 0) + (Number(lot.quantity_quintals) || 0);
      }

      const totalAvailable = farmerLots.reduce((s, l) => s + (Number(l.quantity_quintals) || 0), 0);

      const { data: fpoLotsData } = await supabase
        .from("lots")
        .select("*, crops (name)")
        .eq("owner_type", "fpo")
        .eq("owner_id", fpo.id);

      const fpoLots = (fpoLotsData || []).map((l) => ({
        ...l,
        crop_name: l.crops?.name,
      }));

      return res.json({
        fpo,
        memberFarmerCount: farmerList.length,
        individualLots: farmerLots,
        totalAvailableQuintals: Math.round(totalAvailable * 100) / 100,
        breakdownByCropAndGrade: Object.entries(byCropGrade).map(([k, v]) => {
          const [crop, grade] = k.split("|");
          return { crop, grade, quantityQuintals: Math.round(v * 100) / 100 };
        }),
        aggregatedLots: fpoLots,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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
router.post("/:id/aggregate-lot", async (req, res) => {
  const { sourceLotIds, cropId, grade, location, district, expectedPrice, minAcceptablePrice, harvestDate, availableFrom } = req.body;
  if (!sourceLotIds?.length) return res.status(400).json({ error: "sourceLotIds is required" });
  if (!assertRequired(req, res, ["cropId", "location", "district"])) return;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: sourceLots, error: sErr } = await supabase.from("lots").select("*").in("id", sourceLotIds);
      if (sErr) return res.status(500).json({ error: sErr.message });
      const totalQty = (sourceLots || []).reduce((s, l) => s + (Number(l.quantity_quintals) || 0), 0);

      const lotId = `LOT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 8999))}`;
      const { data: createdLot, error: insErr } = await supabase
        .from("lots")
        .insert({
          id: lotId,
          owner_type: "fpo",
          owner_id: req.params.id,
          crop_id: cropId,
          variety: sourceLots?.[0]?.variety || null,
          quantity_quintals: totalQty,
          grade: grade || null,
          location,
          district,
          harvest_date: harvestDate || null,
          available_from: availableFrom || null,
          expected_price: expectedPrice ?? null,
          min_acceptable_price: minAcceptablePrice ?? null,
          storage_available: 1,
          status: "Open for offers",
          is_aggregated: 1,
          source_lot_ids: JSON.stringify(sourceLotIds),
        })
        .select()
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });

      await supabase.from("lots").update({ status: "Closed" }).in("id", sourceLotIds);
      return res.status(201).json(createdLot);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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
