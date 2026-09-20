import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { DISTRICT_DISTANCES } from "../data/distances.js";
import { estimateDistanceKm, scoreBuyerMatch } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data, error } = await supabase.from("buyers").select("*").order("name");
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.json(db.prepare(`SELECT * FROM buyers ORDER BY name`).all());
});

router.get("/:id", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: buyer, error: bErr } = await supabase.from("buyers").select("*").eq("id", req.params.id).maybeSingle();
      if (bErr) return res.status(500).json({ error: bErr.message });
      if (!buyer) return res.status(404).json({ error: "Buyer not found" });

      const { data: demands, error: dErr } = await supabase
        .from("buyer_demands")
        .select("*, crops (name)")
        .eq("buyer_id", buyer.id)
        .order("created_at", { ascending: false });
      if (dErr) return res.status(500).json({ error: dErr.message });

      const formattedDemands = (demands || []).map((d) => ({
        ...d,
        crop_name: d.crops?.name,
      }));

      return res.json({ ...buyer, demands: formattedDemands });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const buyer = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(req.params.id);
  if (!buyer) return res.status(404).json({ error: "Buyer not found" });
  const demands = db.prepare(`SELECT bd.*, c.name as crop_name FROM buyer_demands bd JOIN crops c ON c.id = bd.crop_id WHERE bd.buyer_id = ? ORDER BY bd.created_at DESC`).all(buyer.id);
  res.json({ ...buyer, demands });
});

// MODULE 15: Buyer demand posting
router.get("/demands/all", async (req, res) => {
  const { cropId, status } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      let query = supabase.from("buyer_demands").select("*, crops (name), buyers (name, buyer_type, verified)");
      if (cropId) query = query.eq("crop_id", cropId);
      if (status) query = query.eq("status", status);
      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const formatted = (data || []).map((d) => ({
        ...d,
        crop_name: d.crops?.name,
        buyer_name: d.buyers?.name,
        buyer_type: d.buyers?.buyer_type,
        verified: d.buyers?.verified,
      }));
      return res.json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  let q = `SELECT bd.*, c.name as crop_name, b.name as buyer_name, b.buyer_type, b.verified FROM buyer_demands bd
            JOIN crops c ON c.id = bd.crop_id JOIN buyers b ON b.id = bd.buyer_id WHERE 1=1`;
  const params = [];
  if (cropId) { q += ` AND bd.crop_id = ?`; params.push(cropId); }
  if (status) { q += ` AND bd.status = ?`; params.push(status); }
  q += ` ORDER BY bd.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.post("/demands", async (req, res) => {
  if (!assertRequired(req, res, ["buyerId", "cropId", "quantityQuintals", "location"])) return;
  const b = req.body;
  const demId = `DEM-${Math.floor(1000 + Math.random() * 8999)}`;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data, error } = await supabase
        .from("buyer_demands")
        .insert({
          id: demId,
          buyer_id: b.buyerId,
          crop_id: b.cropId,
          quantity_quintals: b.quantityQuintals,
          grade_required: b.gradeRequired || null,
          required_by: b.requiredBy || null,
          offer_price: b.offerPrice || null,
          location: b.location,
          status: "Open",
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  db.prepare(`INSERT INTO buyer_demands (id, buyer_id, crop_id, quantity_quintals, grade_required, required_by, offer_price, location, status)
    VALUES (?,?,?,?,?,?,?,?, 'Open')`).run(demId, b.buyerId, b.cropId, b.quantityQuintals, b.gradeRequired || null, b.requiredBy || null, b.offerPrice || null, b.location);
  res.status(201).json(db.prepare(`SELECT * FROM buyer_demands WHERE id = ?`).get(demId));
});

/**
 * MODULE 5: Smart Farmer-Buyer Matching
 */
router.get("/match/for-lot/:lotId", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  let lot = null;
  let demands = [];
  let benchmarkPrice = 1;

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: lotData, error: lErr } = await supabase.from("lots").select("*").eq("id", req.params.lotId).maybeSingle();
      if (lErr) return res.status(500).json({ error: lErr.message });
      if (!lotData) return res.status(404).json({ error: "Lot not found" });
      lot = lotData;

      const { data: demandRows, error: dErr } = await supabase
        .from("buyer_demands")
        .select("*, buyers (name, buyer_type, verified, payment_reliability_pct, response_rate_pct, transactions_completed, location)")
        .eq("crop_id", lot.crop_id)
        .eq("status", "Open");
      if (dErr) return res.status(500).json({ error: dErr.message });

      demands = (demandRows || []).map((d) => ({
        ...d,
        buyer_name: d.buyers?.name,
        buyer_type: d.buyers?.buyer_type,
        verified: d.buyers?.verified,
        payment_reliability_pct: d.buyers?.payment_reliability_pct,
        response_rate_pct: d.buyers?.response_rate_pct,
        transactions_completed: d.buyers?.transactions_completed,
        buyer_location: d.buyers?.location,
      }));

      const { data: benchmarkRow } = await supabase
        .from("market_prices")
        .select("modal_price")
        .eq("crop_id", lot.crop_id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      benchmarkPrice = benchmarkRow?.modal_price || lot.expected_price || 1;
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    lot = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.lotId);
    if (!lot) return res.status(404).json({ error: "Lot not found" });

    demands = db
      .prepare(`SELECT bd.*, b.name as buyer_name, b.buyer_type, b.verified, b.payment_reliability_pct, b.response_rate_pct, b.transactions_completed, b.location as buyer_location
                 FROM buyer_demands bd JOIN buyers b ON b.id = bd.buyer_id WHERE bd.crop_id = ? AND bd.status = 'Open'`)
      .all(lot.crop_id);

    const benchmarkRow = db.prepare(`SELECT modal_price FROM market_prices WHERE crop_id = ? ORDER BY date DESC LIMIT 1`).get(lot.crop_id);
    benchmarkPrice = benchmarkRow?.modal_price || lot.expected_price || 1;
  }

  if (!demands.length) return res.json({ lotId: lot.id, matches: [], note: "No open buyer demand currently posted for this crop." });

  const distances = demands.map((d) => estimateDistanceKm(DISTRICT_DISTANCES, lot.district, d.location));
  const maxDistance = Math.max(...distances);

  const matches = demands.map((d, i) => {
    const distanceKm = distances[i];
    const scored = scoreBuyerMatch({
      cropMatches: true,
      gradeRequired: d.grade_required,
      lotGrade: lot.grade,
      demandQty: d.quantity_quintals,
      lotQty: lot.quantity_quintals,
      offerPrice: d.offer_price,
      benchmarkPrice,
      distanceKm,
      maxDistanceInSet: maxDistance,
      requiredByDate: d.required_by,
      availableFromDate: lot.available_from,
    });

    const reasons = [];
    reasons.push(`Crop matches buyer requirement`);
    if (d.grade_required && lot.grade) {
      if (d.grade_required === lot.grade) reasons.push(`Your Grade ${lot.grade} exactly meets the requirement`);
      else reasons.push(`Your Grade ${lot.grade} vs required Grade ${d.grade_required}`);
    }
    if (d.offer_price >= benchmarkPrice) reasons.push(`Offer price (₹${d.offer_price}) is at or above current market benchmark (₹${benchmarkPrice})`);
    else reasons.push(`Offer price (₹${d.offer_price}) is below current market benchmark (₹${benchmarkPrice})`);
    if (distanceKm <= 50) reasons.push("Short delivery distance, lower logistics cost");
    if (d.verified) reasons.push("Buyer is a verified business");
    if (d.transactions_completed > 20) reasons.push(`Buyer has completed ${d.transactions_completed} prior transactions on the platform`);

    return {
      demandId: d.id,
      buyerId: d.buyer_id,
      buyerName: d.buyer_name,
      buyerType: d.buyer_type,
      verified: !!d.verified,
      paymentReliabilityPct: d.payment_reliability_pct,
      responseRatePct: d.response_rate_pct,
      transactionsCompleted: d.transactions_completed,
      requiredQuantity: d.quantity_quintals,
      gradeRequired: d.grade_required,
      offerPrice: d.offer_price,
      requiredBy: d.required_by,
      distanceKm,
      matchScorePct: Math.round(scored.total),
      scoreComponents: scored.components,
      reasons,
    };
  });

  matches.sort((a, b) => b.matchScorePct - a.matchScorePct);
  res.json({ lotId: lot.id, cropId: lot.crop_id, benchmarkPrice, matches });
});

export default router;
