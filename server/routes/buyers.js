import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { DISTRICT_DISTANCES } from "../data/distances.js";
import { estimateDistanceKm, scoreBuyerMatch } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(db.prepare(`SELECT * FROM buyers ORDER BY name`).all());
});

router.get("/:id", (req, res) => {
  const buyer = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(req.params.id);
  if (!buyer) return res.status(404).json({ error: "Buyer not found" });
  const demands = db.prepare(`SELECT bd.*, c.name as crop_name FROM buyer_demands bd JOIN crops c ON c.id = bd.crop_id WHERE bd.buyer_id = ? ORDER BY bd.created_at DESC`).all(buyer.id);
  res.json({ ...buyer, demands });
});

// MODULE 15: Buyer demand posting
router.get("/demands/all", (req, res) => {
  const { cropId, status } = req.query;
  let q = `SELECT bd.*, c.name as crop_name, b.name as buyer_name, b.buyer_type, b.verified FROM buyer_demands bd
            JOIN crops c ON c.id = bd.crop_id JOIN buyers b ON b.id = bd.buyer_id WHERE 1=1`;
  const params = [];
  if (cropId) { q += ` AND bd.crop_id = ?`; params.push(cropId); }
  if (status) { q += ` AND bd.status = ?`; params.push(status); }
  q += ` ORDER BY bd.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.post("/demands", (req, res) => {
  if (!assertRequired(req, res, ["buyerId", "cropId", "quantityQuintals", "location"])) return;
  const b = req.body;
  const demId = `DEM-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(`INSERT INTO buyer_demands (id, buyer_id, crop_id, quantity_quintals, grade_required, required_by, offer_price, location, status)
    VALUES (?,?,?,?,?,?,?,?, 'Open')`).run(demId, b.buyerId, b.cropId, b.quantityQuintals, b.gradeRequired || null, b.requiredBy || null, b.offerPrice || null, b.location);
  res.status(201).json(db.prepare(`SELECT * FROM buyer_demands WHERE id = ?`).get(demId));
});

/**
 * MODULE 5: Smart Farmer-Buyer Matching
 * Given a lot, score it against every open buyer demand for that crop.
 * Returns ranked matches with an explanation ("why this buyer matches").
 */
router.get("/match/for-lot/:lotId", (req, res) => {
  const lot = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(req.params.lotId);
  if (!lot) return res.status(404).json({ error: "Lot not found" });

  const demands = db
    .prepare(`SELECT bd.*, b.name as buyer_name, b.buyer_type, b.verified, b.payment_reliability_pct, b.response_rate_pct, b.transactions_completed, b.location as buyer_location
               FROM buyer_demands bd JOIN buyers b ON b.id = bd.buyer_id WHERE bd.crop_id = ? AND bd.status = 'Open'`)
    .all(lot.crop_id);

  if (!demands.length) return res.json({ lotId: lot.id, matches: [], note: "No open buyer demand currently posted for this crop." });

  // Benchmark price = current modal price for this crop (any market) — used to judge "price attractiveness"
  const benchmarkRow = db.prepare(`SELECT modal_price FROM market_prices WHERE crop_id = ? ORDER BY date DESC LIMIT 1`).get(lot.crop_id);
  const benchmarkPrice = benchmarkRow?.modal_price || lot.expected_price || 1;

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
