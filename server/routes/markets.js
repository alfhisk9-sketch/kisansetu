import { Router } from "express";
import { db } from "../db.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";
import {
  estimateDistanceKm,
  calcHaversineDistanceKm,
  calcTransportCost,
  calcMarketCharges,
  calcNetRealization,
  calcTrend,
  calcVolatility,
  scoreSellingOption,
} from "../lib/algorithms.js";

import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  if (isProduction && supabase) {
    try {
      const { data, error } = await supabase.from("markets").select("*").order("name");
      if (!error && data && data.length > 0) return res.json(data);
    } catch (_) {}
  }
  res.json(db.prepare(`SELECT * FROM markets ORDER BY name`).all());
});

// Full price history for a crop at a market (used for trend charts)
router.get("/prices", async (req, res) => {
  const { cropId, marketId } = req.query;
  if (!cropId) return res.status(400).json({ error: "cropId is required" });
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  if (isProduction && supabase) {
    try {
      let q = supabase.from("market_prices").select("*").eq("crop_id", cropId).order("date", { ascending: true });
      if (marketId) q = q.eq("market_id", marketId);
      const { data, error } = await q;
      if (!error && data && data.length > 0) return res.json(data);
    } catch (_) {}
  }
  let rows;
  if (marketId) {
    rows = db
      .prepare(`SELECT * FROM market_prices WHERE crop_id = ? AND market_id = ? ORDER BY date ASC`)
      .all(cropId, marketId);
  } else {
    rows = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date ASC`).all(cropId);
  }
  res.json(rows);
});

function demandLevelFor(cropId, district) {
  const openDemand = db
    .prepare(`SELECT SUM(quantity_quintals) as qty, COUNT(*) as cnt FROM buyer_demands WHERE crop_id = ? AND status = 'Open'`)
    .get(cropId);
  const qty = openDemand?.qty || 0;
  if (qty >= 100) return "High";
  if (qty >= 30) return "Medium";
  return "Low";
}

/**
 * MODULE 2 + 3: Price Discovery Engine + Market Comparison
 * Given a crop, farmer district, quantity and quality grade, compare every
 * market that trades the crop and rank by net realization (or other sort).
 * Every number is computed with the deterministic formulas in lib/algorithms.js.
 */
router.get("/compare", (req, res) => {
  const { cropId, district, quantity, grade, storageAvailable, sortBy, userLat, userLng } = req.query;
  if (!cropId || !district) return res.status(400).json({ error: "cropId and district are required" });
  const qty = Number(quantity) || 10;

  const markets = db.prepare(`SELECT DISTINCT m.* FROM markets m JOIN market_prices mp ON mp.market_id = m.id WHERE mp.crop_id = ?`).all(cropId);
  if (!markets.length) return res.json({ options: [], note: "No price data available for this crop yet." });

  const demandLevel = demandLevelFor(cropId, district);

  const rawOptions = markets.map((market) => {
    const series = db
      .prepare(`SELECT date, modal_price, min_price, max_price, source, source_url, data_status, updated_at FROM market_prices WHERE crop_id = ? AND market_id = ? ORDER BY date ASC`)
      .all(cropId, market.id);
    const latest = series[series.length - 1] || {};
    const trend7 = calcTrend(series, 7);
    const trend30 = calcTrend(series, 30);
    const volatility = calcVolatility(series);

    let distanceKm = null;
    let distanceMethod = "district_table";
    if (userLat && userLng && market.lat && market.lng) {
      const straightLine = calcHaversineDistanceKm(userLat, userLng, market.lat, market.lng);
      if (straightLine != null) {
        distanceKm = Math.round(straightLine * 1.22); // Road winding coefficient
        distanceMethod = "haversine_road_est";
      }
    }
    if (distanceKm == null) {
      distanceKm = estimateDistanceKm(DISTRICT_DISTANCES, district, market.district);
    }

    const transportCost = calcTransportCost({ distanceKm, quantityQuintals: qty });
    const marketCharges = calcMarketCharges(latest.modal_price || 0);
    const storageCost = storageAvailable === "true" ? 0 : 0; // storage cost handled separately in Module 10
    const netRealization = calcNetRealization({ sellingPrice: latest.modal_price || 0, transportCost, marketCharges, storageCost });

    const arrivalRow = db
      .prepare(`SELECT arrival_qty_quintals, source, source_url, data_status, updated_at FROM market_prices WHERE crop_id = ? AND market_id = ? ORDER BY date DESC LIMIT 1`)
      .get(cropId, market.id);

    return {
      marketId: market.id,
      marketName: market.name,
      district: market.district,
      state: market.state || "Andhra Pradesh",
      lat: market.lat,
      lng: market.lng,
      address: market.address || `${market.name}, ${market.district}`,
      pincode: market.pincode,
      currentPrice: latest.modal_price,
      minPrice: latest.min_price || (series.length ? Math.min(...series.map((s) => s.modal_price)) : null),
      maxPrice: latest.max_price || null,
      source: arrivalRow?.source || latest.source || "Government of India / AGMARKNET",
      sourceUrl: arrivalRow?.source_url || latest.source_url || "https://agmarknet.gov.in",
      dataStatus: arrivalRow?.data_status || latest.data_status || "LATEST AVAILABLE",
      updatedAt: arrivalRow?.updated_at || latest.updated_at || latest.date,
      trend7DayAvg: trend7.average,
      trend7DayChangePct: trend7.changePct,
      trend30DayAvg: trend30.average,
      volatilityPct: volatility,
      arrivalQtyQuintals: arrivalRow?.arrival_qty_quintals ?? null,
      distanceKm,
      distanceMethod,
      transportCostPerQuintal: transportCost,
      marketChargesPerQuintal: marketCharges,
      netRealizationPerQuintal: netRealization,
      qualityMeetsRequirement: true,
      demandLevel,
    };
  });

  const maxNet = Math.max(...rawOptions.map((o) => o.netRealizationPerQuintal));
  const minNet = Math.min(...rawOptions.map((o) => o.netRealizationPerQuintal));
  const maxDist = Math.max(...rawOptions.map((o) => o.distanceKm));

  let options = rawOptions.map((o) => {
    const scored = scoreSellingOption({
      netRealization: o.netRealizationPerQuintal,
      maxNetRealizationInSet: maxNet,
      minNetRealizationInSet: minNet,
      distanceKm: o.distanceKm,
      maxDistanceInSet: maxDist,
      demandLevel: o.demandLevel,
      qualityMeetsRequirement: o.qualityMeetsRequirement,
      trendChangePct: o.trend7DayChangePct ?? 0,
    });

    const reasons = [];
    if (o.netRealizationPerQuintal === maxNet) reasons.push(`Highest net realization in this comparison (₹${o.netRealizationPerQuintal}/q)`);
    else reasons.push(`Net realization is ₹${Math.round(maxNet - o.netRealizationPerQuintal)}/q lower than the best option`);
    if (o.distanceKm <= 30) reasons.push("Very low transport distance");
    else if (o.distanceKm === maxDist) reasons.push("Longest transport distance in this comparison — raises cost");
    if ((o.trend7DayChangePct ?? 0) > 1) reasons.push(`Recent 7-day price trend is positive (+${o.trend7DayChangePct}%)`);
    else if ((o.trend7DayChangePct ?? 0) < -1) reasons.push(`Recent 7-day price trend is negative (${o.trend7DayChangePct}%)`);
    if (o.demandLevel === "High") reasons.push("Strong current buyer demand for this crop");

    return { ...o, recommendationScore: scored.total, scoreComponents: scored.components, reasons };
  });

  const sortKey = {
    net: (a, b) => b.netRealizationPerQuintal - a.netRealizationPerQuintal,
    price: (a, b) => b.currentPrice - a.currentPrice,
    distance: (a, b) => a.distanceKm - b.distanceKm,
    demand: (a, b) => b.recommendationScore - a.recommendationScore,
  }[sortBy] || ((a, b) => b.netRealizationPerQuintal - a.netRealizationPerQuintal);

  options = options.sort(sortKey);

  res.json({
    cropId,
    farmerDistrict: district,
    quantityQuintals: qty,
    grade: grade || null,
    demandLevel,
    options,
    disclaimer: "Net realization calculations are estimates based on mandi arrivals, distances, and standard charges. Selling prices fluctuate based on daily market arrivals.",
  });
});

/**
 * PHASE 18 & 19: Geolocation & Nearby Storage Facilities
 * Finds verified storage facilities near a given market or coordinates
 */
router.get("/nearby-storage", (req, res) => {
  const { marketId, lat, lng, limit = 5 } = req.query;
  let targetLat = Number(lat);
  let targetLng = Number(lng);

  if (marketId && (isNaN(targetLat) || isNaN(targetLng))) {
    const m = db.prepare(`SELECT lat, lng, district FROM markets WHERE id = ?`).get(marketId);
    if (m && m.lat && m.lng) {
      targetLat = Number(m.lat);
      targetLng = Number(m.lng);
    }
  }

  const facilities = db.prepare(`SELECT * FROM storage_facilities ORDER BY verified DESC`).all();

  const enriched = facilities.map((f) => {
    let distanceKm = null;
    if (!isNaN(targetLat) && !isNaN(targetLng) && f.latitude && f.longitude) {
      const straight = calcHaversineDistanceKm(targetLat, targetLng, f.latitude, f.longitude);
      distanceKm = straight != null ? Math.round(straight * 1.2) : null;
    }
    return {
      ...f,
      distanceKm,
      distanceLabel: distanceKm != null ? `${distanceKm} km (approx.)` : "Distance on request",
    };
  });

  if (!isNaN(targetLat) && !isNaN(targetLng)) {
    enriched.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  res.json(enriched.slice(0, Number(limit)));
});

export default router;
