import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
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

/**
 * GET /api/markets
 * Lists all APMC markets
 */
router.get("/", async (req, res) => {
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("markets").select("*").order("name");
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  res.json(db.prepare(`SELECT * FROM markets ORDER BY name`).all());
});

/**
 * GET /api/markets/nearest
 * PHASE 4: Real Nearest Mandi Engine
 * Calculates straight-line Haversine distance from user coordinates to all verified APMC mandis.
 */
router.get("/nearest", async (req, res) => {
  const { lat, lng, cropId, district, limit = 5 } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let userLat = Number(lat);
  let userLng = Number(lng);

  // If coordinates not provided, try resolving from district
  if ((isNaN(userLat) || isNaN(userLng)) && district) {
    const districtCoords = {
      "guntur": [16.2974, 80.4578],
      "krishna": [16.5062, 80.6480],
      "west godavari": [16.7107, 81.0952],
      "bhimavaram": [16.5449, 81.5212],
      "east godavari": [16.9891, 82.2475],
      "kurnool": [15.8281, 78.0373],
      "anantapur": [14.6819, 77.6006],
      "nellore": [14.4426, 79.9865],
      "chittoor": [13.2172, 79.1003],
      "kadapa": [14.4673, 78.8241],
      "visakhapatnam": [17.6868, 83.2185]
    };
    const lookup = districtCoords[district.toLowerCase().trim()];
    if (lookup) {
      userLat = lookup[0];
      userLng = lookup[1];
    }
  }

  let marketsList = [];
  let pricesList = [];

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const { data: mData, error: mErr } = await supabase.from("markets").select("*");
      if (mErr) return res.status(500).json({ error: mErr.message });
      marketsList = mData || [];

      let q = supabase.from("market_prices").select("*").order("date", { ascending: false });
      if (cropId) q = q.eq("crop_id", cropId);
      const { data: pData } = await q;
      pricesList = pData || [];
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = getDb();
    marketsList = db.prepare(`SELECT * FROM markets`).all();
    if (cropId) {
      pricesList = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date DESC`).all(cropId);
    } else {
      pricesList = db.prepare(`SELECT * FROM market_prices ORDER BY date DESC`).all();
    }
  }

  const hasUserCoords = !isNaN(userLat) && !isNaN(userLng);

  const results = marketsList.map((m) => {
    const mLat = Number(m.lat || m.latitude);
    const mLng = Number(m.lng || m.longitude);

    let straightLineDistanceKm = null;
    if (hasUserCoords && !isNaN(mLat) && !isNaN(mLng)) {
      straightLineDistanceKm = calcHaversineDistanceKm(userLat, userLng, mLat, mLng);
    }

    // Find price records for this market
    const mPrices = pricesList.filter((p) => p.market_id === m.id);
    const latest = mPrices[0] || {};

    return {
      marketId: m.id,
      market: m.name,
      district: m.district,
      state: m.state || "Andhra Pradesh",
      latitude: mLat,
      longitude: mLng,
      straightLineDistanceKm,
      roadDistanceKm: null, // Road distance requires routing provider (OSRM); straight-line Haversine is authoritative
      address: m.address || `${m.name}, ${m.district}`,
      pincode: m.pincode || null,
      commodity: latest.commodity || (cropId ? cropId.replace("crop-", "") : "General Produce"),
      latestPrice: latest.modal_price || null,
      modalPrice: latest.modal_price || null,
      minPrice: latest.min_price || null,
      maxPrice: latest.max_price || null,
      arrivalQuantity: latest.arrival_qty_quintals ?? null,
      priceDate: latest.date || null,
      dataStatus: latest.data_status || "LATEST AVAILABLE",
      source: latest.source || "Government of India / AGMARKNET",
      sourceUrl: latest.source_url || "https://agmarknet.gov.in",
      locationSource: m.location_source || "verified_apmc_directory",
      verificationStatus: m.status === "active" ? "verified" : (m.status || "verified")
    };
  });

  if (hasUserCoords) {
    results.sort((a, b) => (a.straightLineDistanceKm ?? 99999) - (b.straightLineDistanceKm ?? 99999));
  } else {
    results.sort((a, b) => a.market.localeCompare(b.market));
  }

  const maxLimit = Math.min(Number(limit) || 5, 20);
  const sliced = results.slice(0, maxLimit);

  res.json({
    userLocation: hasUserCoords ? { latitude: userLat, longitude: userLng } : null,
    totalMarketsEvaluated: marketsList.length,
    distanceMetric: "Haversine straight-line distance (km)",
    nearestMandis: sliced,
    markets: sliced
  });
});

/**
 * GET /api/markets/prices
 * Price history for a crop at a market
 */
router.get("/prices", async (req, res) => {
  const { cropId, marketId } = req.query;
  if (!cropId) return res.status(400).json({ error: "cropId is required" });

  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      let q = supabase.from("market_prices").select("*").eq("crop_id", cropId).order("date", { ascending: true });
      if (marketId) q = q.eq("market_id", marketId);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
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

router.get("/compare", async (req, res) => {
  const { cropId, district, quantity, grade, storageAvailable, sortBy, userLat, userLng } = req.query;
  if (!cropId) return res.status(400).json({ error: "cropId is required" });
  const effectiveDistrict = district || "Guntur";
  const qty = Number(quantity) || 10;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let markets = [];
  let allPrices = [];
  let openDemands = [];

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const { data: mData } = await supabase.from("markets").select("*");
      markets = mData || [];

      const { data: pData } = await supabase
        .from("market_prices")
        .select("*")
        .eq("crop_id", cropId)
        .order("date", { ascending: true });
      allPrices = pData || [];

      const { data: dData } = await supabase
        .from("buyer_demands")
        .select("quantity_quintals")
        .eq("crop_id", cropId)
        .eq("status", "Open");
      openDemands = dData || [];
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = getDb();
    markets = db.prepare(`SELECT DISTINCT m.* FROM markets m JOIN market_prices mp ON mp.market_id = m.id WHERE mp.crop_id = ?`).all(cropId);
    allPrices = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date ASC`).all(cropId);
    openDemands = db.prepare(`SELECT quantity_quintals FROM buyer_demands WHERE crop_id = ? AND status = 'Open'`).all(cropId);
  }

  // Filter markets that trade this crop
  const tradingMarketIds = new Set(allPrices.map((p) => p.market_id));
  const activeMarkets = markets.filter((m) => tradingMarketIds.has(m.id));

  if (!activeMarkets.length) {
    return res.json({ options: [], note: "No price data available for this crop yet." });
  }

  const totalDemandQty = openDemands.reduce((sum, d) => sum + (Number(d.quantity_quintals) || 0), 0);
  const demandLevel = totalDemandQty >= 100 ? "High" : totalDemandQty >= 30 ? "Medium" : "Low";

  const rawOptions = activeMarkets.map((market) => {
    const series = allPrices.filter((p) => p.market_id === market.id);
    const latest = series[series.length - 1] || {};
    const trend7 = calcTrend(series, 7);
    const trend30 = calcTrend(series, 30);
    const volatility = calcVolatility(series);

    const mLat = Number(market.lat || market.latitude);
    const mLng = Number(market.lng || market.longitude);

    let straightLineDistanceKm = null;
    let roadDistanceKm = null;
    let distanceMethod = "district_table";

    if (userLat && userLng && !isNaN(mLat) && !isNaN(mLng)) {
      straightLineDistanceKm = calcHaversineDistanceKm(userLat, userLng, mLat, mLng);
      if (straightLineDistanceKm != null) {
        roadDistanceKm = Math.round(straightLineDistanceKm * 1.22 * 10) / 10;
        distanceMethod = "haversine_road_est";
      }
    }
    if (roadDistanceKm == null) {
      roadDistanceKm = estimateDistanceKm(DISTRICT_DISTANCES, effectiveDistrict, market.district);
    }

    const transportCost = calcTransportCost({ distanceKm: roadDistanceKm, quantityQuintals: qty });
    const marketCharges = calcMarketCharges(latest.modal_price || 0);
    const storageCost = 0;
    const netRealization = calcNetRealization({ sellingPrice: latest.modal_price || 0, transportCost, marketCharges, storageCost });

    return {
      marketId: market.id,
      marketName: market.name,
      district: market.district,
      state: market.state || "Andhra Pradesh",
      lat: mLat,
      lng: mLng,
      address: market.address || `${market.name}, ${market.district}`,
      pincode: market.pincode,
      currentPrice: latest.modal_price,
      minPrice: latest.min_price || (series.length ? Math.min(...series.map((s) => s.modal_price)) : null),
      maxPrice: latest.max_price || null,
      source: latest.source || "Government of India / AGMARKNET",
      sourceUrl: latest.source_url || "https://agmarknet.gov.in",
      dataStatus: latest.data_status || "LATEST AVAILABLE",
      updatedAt: latest.updated_at || latest.date,
      trend7DayAvg: trend7.average,
      trend7DayChangePct: trend7.changePct,
      trend30DayAvg: trend30.average,
      volatilityPct: volatility,
      arrivalQtyQuintals: latest.arrival_qty_quintals ?? null,
      straightLineDistanceKm,
      distanceKm: roadDistanceKm,
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
    else reasons.push(`Net realization is ₹${Math.round(maxNet - o.netRealizationPerQuintal)}/q lower than the top option`);
    if (o.distanceKm <= 30) reasons.push("Low transport distance");
    else if (o.distanceKm === maxDist) reasons.push("Longer transport distance raises logistics cost");
    if ((o.trend7DayChangePct ?? 0) > 1) reasons.push(`7-day price trend is positive (+${o.trend7DayChangePct}%)`);
    else if ((o.trend7DayChangePct ?? 0) < -1) reasons.push(`7-day price trend is negative (${o.trend7DayChangePct}%)`);
    if (o.demandLevel === "High") reasons.push("Strong verified buyer demand for this crop");

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
    disclaimer: "Net realization is derived mathematically (Sale Value - Documented Transport Cost - Mandi Charges). Selling prices reflect official market arrivals and fluctuate daily.",
  });
});

/**
 * GET /api/markets/nearby-storage
 * Nearby Storage Facilities
 */
router.get("/nearby-storage", async (req, res) => {
  const { marketId, lat, lng, limit = 5 } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let targetLat = Number(lat);
  let targetLng = Number(lng);

  let facilities = [];

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    if (marketId && (isNaN(targetLat) || isNaN(targetLng))) {
      const { data: m } = await supabase.from("markets").select("lat, lng, district").eq("id", marketId).maybeSingle();
      if (m?.lat && m?.lng) {
        targetLat = Number(m.lat);
        targetLng = Number(m.lng);
      }
    }

    const { data: fData } = await supabase.from("storage_facilities").select("*").order("verified", { ascending: false });
    facilities = fData || [];
  } else {
    const db = getDb();
    if (marketId && (isNaN(targetLat) || isNaN(targetLng))) {
      const m = db.prepare(`SELECT lat, lng, district FROM markets WHERE id = ?`).get(marketId);
      if (m?.lat && m?.lng) {
        targetLat = Number(m.lat);
        targetLng = Number(m.lng);
      }
    }
    facilities = db.prepare(`SELECT * FROM storage_facilities ORDER BY verified DESC`).all();
  }

  const enriched = facilities.map((f) => {
    let straightLineDistanceKm = null;
    const fLat = Number(f.latitude || f.lat);
    const fLng = Number(f.longitude || f.lng);
    if (!isNaN(targetLat) && !isNaN(targetLng) && !isNaN(fLat) && !isNaN(fLng)) {
      straightLineDistanceKm = calcHaversineDistanceKm(targetLat, targetLng, fLat, fLng);
    }
    return {
      ...f,
      straightLineDistanceKm,
      distanceKm: straightLineDistanceKm,
      distanceLabel: straightLineDistanceKm != null ? `${straightLineDistanceKm} km straight-line` : "Distance on request",
    };
  });

  if (!isNaN(targetLat) && !isNaN(targetLng)) {
    enriched.sort((a, b) => (a.straightLineDistanceKm ?? 9999) - (b.straightLineDistanceKm ?? 9999));
  }

  res.json(enriched.slice(0, Number(limit)));
});

export default router;
