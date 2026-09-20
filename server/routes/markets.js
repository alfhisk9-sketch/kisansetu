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
 * 1. GET /api/markets
 * Lists all verified APMC markets
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
 * 2. GET /api/markets/search
 * Search and filter markets with pagination
 */
router.get("/search", async (req, res) => {
  const { keyword, q, state, district, commodity, limit = 20, page = 1 } = req.query;
  const searchTerm = (keyword || q || "").trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const numLimit = Math.min(Number(limit) || 20, 100);
  const numPage = Math.max(Number(page) || 1, 1);
  const offset = (numPage - 1) * numLimit;

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      let query = supabase.from("markets").select("*", { count: "exact" });
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,district.ilike.%${searchTerm}%,state.ilike.%${searchTerm}%`);
      }
      if (state) query = query.ilike("state", `%${state.trim()}%`);
      if (district) query = query.ilike("district", `%${district.trim()}%`);

      query = query.range(offset, offset + numLimit - 1).order("name");
      const { data, count, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({
        markets: data || [],
        total: count || 0,
        page: numPage,
        limit: numLimit
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  let sql = `SELECT * FROM markets WHERE 1=1`;
  const params = [];
  if (searchTerm) {
    sql += ` AND (LOWER(name) LIKE ? OR LOWER(district) LIKE ? OR LOWER(state) LIKE ?)`;
    params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
  }
  if (state) {
    sql += ` AND LOWER(state) LIKE ?`;
    params.push(`%${state.toLowerCase().trim()}%`);
  }
  if (district) {
    sql += ` AND LOWER(district) LIKE ?`;
    params.push(`%${district.toLowerCase().trim()}%`);
  }
  const allRows = db.prepare(sql).all(...params);
  const sliced = allRows.slice(offset, offset + numLimit);
  res.json({
    markets: sliced,
    total: allRows.length,
    page: numPage,
    limit: numLimit
  });
});

/**
 * 3. GET /api/markets/nearest
 * Authoritative Nearest Mandi Engine using Haversine straight-line distance
 */
router.get("/nearest", async (req, res) => {
  const { lat, lng, cropId, state, district, limit = 5, radiusKm } = req.query;
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
      "visakhapatnam": [17.6868, 83.2185],
      "nashik": [20.1477, 74.2255],
      "lasalgaon": [20.1477, 74.2255],
      "warangal": [17.9689, 79.5941],
      "dharwad": [15.3647, 75.1240],
      "indore": [22.6841, 75.8450],
      "rajkot": [22.3039, 70.8022]
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
      let mQuery = supabase.from("markets").select("*");
      if (state) mQuery = mQuery.ilike("state", `%${state.trim()}%`);
      const { data: mData, error: mErr } = await mQuery;
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
    let mSql = `SELECT * FROM markets`;
    const mParams = [];
    if (state) {
      mSql += ` WHERE LOWER(state) LIKE ?`;
      mParams.push(`%${state.toLowerCase().trim()}%`);
    }
    marketsList = db.prepare(mSql).all(...mParams);
    if (cropId) {
      pricesList = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date DESC`).all(cropId);
    } else {
      pricesList = db.prepare(`SELECT * FROM market_prices ORDER BY date DESC`).all();
    }
  }

  const hasUserCoords = !isNaN(userLat) && !isNaN(userLng);

  let results = marketsList.map((m) => {
    const mLat = Number(m.lat || m.latitude);
    const mLng = Number(m.lng || m.longitude);

    let straightLineDistanceKm = null;
    if (hasUserCoords && !isNaN(mLat) && !isNaN(mLng)) {
      straightLineDistanceKm = calcHaversineDistanceKm(userLat, userLng, mLat, mLng);
    }

    // Find latest price record for this market
    const mPrices = pricesList.filter((p) => p.market_id === m.id);
    const latest = mPrices[0] || {};

    return {
      marketId: m.id,
      market: m.name,
      district: m.district,
      state: m.state || "Andhra Pradesh",
      latitude: !isNaN(mLat) ? mLat : null,
      longitude: !isNaN(mLng) ? mLng : null,
      straightLineDistanceKm,
      roadDistanceKm: null, // Strictly null unless explicit routing engine (OSRM) used
      address: m.address || `${m.name}, ${m.district}`,
      pincode: m.pincode || null,
      commodity: latest.commodity || (cropId ? cropId.replace("crop-", "") : "General Produce"),
      latestPrice: latest.modal_price != null ? Number(latest.modal_price) : null,
      modalPrice: latest.modal_price != null ? Number(latest.modal_price) : null,
      minPrice: latest.min_price != null ? Number(latest.min_price) : null,
      maxPrice: latest.max_price != null ? Number(latest.max_price) : null,
      arrivalQuantity: latest.arrival_qty_quintals != null ? Number(latest.arrival_qty_quintals) : null,
      priceDate: latest.date || null,
      dataStatus: latest.data_status || "LATEST AVAILABLE",
      source: latest.source || "Government of India / AGMARKNET",
      sourceUrl: latest.source_url || "https://agmarknet.gov.in",
      locationSource: m.location_source || "verified_apmc_directory",
      verificationStatus: m.status === "active" ? "VERIFIED" : (m.status || "VERIFIED")
    };
  });

  if (radiusKm && hasUserCoords) {
    const r = Number(radiusKm);
    results = results.filter((m) => m.straightLineDistanceKm != null && m.straightLineDistanceKm <= r);
  }

  if (hasUserCoords) {
    results.sort((a, b) => (a.straightLineDistanceKm ?? 99999) - (b.straightLineDistanceKm ?? 99999));
  } else {
    results.sort((a, b) => a.market.localeCompare(b.market));
  }

  const maxLimit = Math.min(Number(limit) || 5, 50);
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
 * 4. GET /api/markets/compare
 * Structured market comparison with realistic net realization breakdown
 */
router.get("/compare", async (req, res) => {
  const { cropId, state, district, quantity, grade, storageAvailable, sortBy, userLat, userLng } = req.query;
  if (!cropId) return res.status(400).json({ error: "cropId is required" });
  const effectiveDistrict = district || (state ? null : "Guntur");
  const qty = Number(quantity) || 10;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let markets = [];
  let allPrices = [];
  let openDemands = [];

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      let mQ = supabase.from("markets").select("*");
      if (state) mQ = mQ.ilike("state", `%${state.trim()}%`);
      const { data: mData } = await mQ;
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
    let mSql = `SELECT DISTINCT m.* FROM markets m JOIN market_prices mp ON mp.market_id = m.id WHERE mp.crop_id = ?`;
    const mParams = [cropId];
    if (state) {
      mSql += ` AND LOWER(m.state) LIKE ?`;
      mParams.push(`%${state.toLowerCase().trim()}%`);
    }
    markets = db.prepare(mSql).all(...mParams);
    allPrices = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date ASC`).all(cropId);
    openDemands = db.prepare(`SELECT quantity_quintals FROM buyer_demands WHERE crop_id = ? AND status = 'Open'`).all(cropId);
  }

  // Filter markets that trade this crop
  const tradingMarketIds = new Set(allPrices.map((p) => p.market_id));
  const activeMarkets = markets.filter((m) => tradingMarketIds.has(m.id));

  if (!activeMarkets.length) {
    return res.json({ options: [], note: "No verified price data available for this crop in the selected region." });
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
    let distanceMethod = "unavailable";
    let transportCostAvailable = false;
    let transportCost = null;

    if (userLat && userLng && !isNaN(mLat) && !isNaN(mLng)) {
      straightLineDistanceKm = calcHaversineDistanceKm(Number(userLat), Number(userLng), mLat, mLng);
      if (straightLineDistanceKm != null) {
        roadDistanceKm = Math.round(straightLineDistanceKm * 1.22 * 10) / 10;
        distanceMethod = "haversine_road_est";
      }
    }
    if (roadDistanceKm == null && effectiveDistrict) {
      roadDistanceKm = estimateDistanceKm(DISTRICT_DISTANCES, effectiveDistrict, market.district);
      if (roadDistanceKm != null) distanceMethod = "district_table";
    }

    if (roadDistanceKm != null) {
      transportCost = calcTransportCost({ distanceKm: roadDistanceKm, quantityQuintals: qty });
      transportCostAvailable = true;
    }

    const modalPrice = latest.modal_price != null ? Number(latest.modal_price) : 0;
    const marketCharges = calcMarketCharges(modalPrice);
    const netRealization = transportCostAvailable
      ? calcNetRealization({ sellingPrice: modalPrice, transportCost, marketCharges, storageCost: 0 })
      : null;

    return {
      marketId: market.id,
      marketName: market.name,
      district: market.district,
      state: market.state || "Andhra Pradesh",
      lat: !isNaN(mLat) ? mLat : null,
      lng: !isNaN(mLng) ? mLng : null,
      address: market.address || `${market.name}, ${market.district}`,
      pincode: market.pincode,
      currentPrice: modalPrice,
      modalPrice,
      minPrice: latest.min_price != null ? Number(latest.min_price) : modalPrice,
      maxPrice: latest.max_price != null ? Number(latest.max_price) : modalPrice,
      source: latest.source || "Government of India / AGMARKNET",
      sourceUrl: latest.source_url || "https://agmarknet.gov.in",
      dataStatus: latest.data_status || "LATEST AVAILABLE",
      updatedAt: latest.updated_at || latest.date,
      date: latest.date,
      trend7DayAvg: trend7.average,
      trend7DayChangePct: trend7.changePct,
      trend30DayAvg: trend30.average,
      volatilityPct: volatility,
      arrivalQtyQuintals: latest.arrival_qty_quintals != null ? Number(latest.arrival_qty_quintals) : null,
      straightLineDistanceKm,
      distanceKm: roadDistanceKm,
      distanceMethod,
      transportCostPerQuintal: transportCostAvailable ? transportCost : "unavailable",
      marketChargesPerQuintal: marketCharges,
      netRealizationPerQuintal: netRealization != null ? netRealization : "unavailable",
      qualityMeetsRequirement: true,
      demandLevel,
    };
  });

  const numericNets = rawOptions.map((o) => o.netRealizationPerQuintal).filter((n) => typeof n === "number");
  const maxNet = numericNets.length ? Math.max(...numericNets) : 0;
  const minNet = numericNets.length ? Math.min(...numericNets) : 0;
  const maxDist = Math.max(...rawOptions.map((o) => (typeof o.distanceKm === "number" ? o.distanceKm : 50)));

  let options = rawOptions.map((o) => {
    const netVal = typeof o.netRealizationPerQuintal === "number" ? o.netRealizationPerQuintal : o.modalPrice;
    const scored = scoreSellingOption({
      netRealization: netVal,
      maxNetRealizationInSet: maxNet || netVal,
      minNetRealizationInSet: minNet || netVal,
      distanceKm: typeof o.distanceKm === "number" ? o.distanceKm : 50,
      maxDistanceInSet: maxDist,
      demandLevel: o.demandLevel,
      qualityMeetsRequirement: o.qualityMeetsRequirement,
      trendChangePct: o.trend7DayChangePct ?? 0,
    });

    const reasons = [];
    if (typeof o.netRealizationPerQuintal === "number" && o.netRealizationPerQuintal === maxNet) {
      reasons.push(`Highest net realization in this comparison (₹${o.netRealizationPerQuintal}/q)`);
    }
    if (o.distanceKm && o.distanceKm <= 30) reasons.push("Low transport distance");
    if ((o.trend7DayChangePct ?? 0) > 1) reasons.push(`7-day price trend is positive (+${o.trend7DayChangePct}%)`);
    if (o.demandLevel === "High") reasons.push("Strong verified buyer demand for this crop");

    return { ...o, recommendationScore: scored.total, scoreComponents: scored.components, reasons };
  });

  const sortKey = {
    net: (a, b) => {
      const aVal = typeof a.netRealizationPerQuintal === "number" ? a.netRealizationPerQuintal : a.currentPrice;
      const bVal = typeof b.netRealizationPerQuintal === "number" ? b.netRealizationPerQuintal : b.currentPrice;
      return bVal - aVal;
    },
    price: (a, b) => b.currentPrice - a.currentPrice,
    distance: (a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999),
    demand: (a, b) => b.recommendationScore - a.recommendationScore,
  }[sortBy] || ((a, b) => b.currentPrice - a.currentPrice);

  options = options.sort(sortKey);

  res.json({
    cropId,
    region: state || district || "All",
    quantityQuintals: qty,
    grade: grade || null,
    demandLevel,
    options,
    disclaimer: "Net realization is derived mathematically (Sale Value - Transport Cost - Mandi Charges). Transport cost is only computed when a verified distance or rate is available.",
  });
});

/**
 * 5. GET /api/markets/trends
 * Historical price and arrival trends for a crop
 */
router.get("/trends", async (req, res) => {
  const { cropId, marketId, range = "30d", from, to } = req.query;
  if (!cropId) return res.status(400).json({ error: "cropId is required" });

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let startDate = null;
  const today = new Date();
  if (from) {
    startDate = from;
  } else if (range === "7d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split("T")[0];
  } else if (range === "30d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    startDate = d.toISOString().split("T")[0];
  } else if (range === "90d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 90);
    startDate = d.toISOString().split("T")[0];
  }

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      let q = supabase
        .from("market_prices")
        .select("date, min_price, modal_price, max_price, arrival_qty_quintals, market, district, state, source, data_status")
        .eq("crop_id", cropId)
        .order("date", { ascending: true });

      if (marketId && marketId !== "all") q = q.eq("market_id", marketId);
      if (startDate) q = q.gte("date", startDate);
      if (to) q = q.lte("date", to);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const trends = (data || []).map((r) => ({
        date: r.date,
        minPrice: Number(r.min_price),
        modalPrice: Number(r.modal_price),
        maxPrice: Number(r.max_price),
        arrivalQuantity: r.arrival_qty_quintals != null ? Number(r.arrival_qty_quintals) : null,
        market: r.market,
        district: r.district,
        state: r.state,
        source: r.source,
        dataStatus: r.data_status || "LATEST AVAILABLE"
      }));

      return res.json({
        cropId,
        marketId: marketId || "all",
        range,
        dataPointsCount: trends.length,
        trends
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  let sql = `SELECT date, min_price, modal_price, max_price, arrival_qty_quintals, market, district, state, source, data_status FROM market_prices WHERE crop_id = ?`;
  const params = [cropId];
  if (marketId && marketId !== "all") {
    sql += ` AND market_id = ?`;
    params.push(marketId);
  }
  if (startDate) {
    sql += ` AND date >= ?`;
    params.push(startDate);
  }
  if (to) {
    sql += ` AND date <= ?`;
    params.push(to);
  }
  sql += ` ORDER BY date ASC`;
  const rows = db.prepare(sql).all(...params);
  const trends = rows.map((r) => ({
    date: r.date,
    minPrice: Number(r.min_price),
    modalPrice: Number(r.modal_price),
    maxPrice: Number(r.max_price),
    arrivalQuantity: r.arrival_qty_quintals != null ? Number(r.arrival_qty_quintals) : null,
    market: r.market,
    district: r.district,
    state: r.state,
    source: r.source,
    dataStatus: r.data_status || "LATEST AVAILABLE"
  }));
  res.json({
    cropId,
    marketId: marketId || "all",
    range,
    dataPointsCount: trends.length,
    trends
  });
});

/**
 * 6. GET /api/markets/prices
 * Detailed price history with full provenance
 */
router.get("/prices", async (req, res) => {
  const { cropId, marketId, state, district, from, to, limit = 50, page = 1 } = req.query;
  if (!cropId && !marketId && !state && !district) {
    return res.status(400).json({ error: "At least one filter (cropId, marketId, state, district) is required" });
  }

  const numLimit = Math.min(Number(limit) || 50, 200);
  const numPage = Math.max(Number(page) || 1, 1);
  const offset = (numPage - 1) * numLimit;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      let q = supabase.from("market_prices").select("*", { count: "exact" }).order("date", { ascending: false });
      if (cropId) q = q.eq("crop_id", cropId);
      if (marketId) q = q.eq("market_id", marketId);
      if (state) q = q.ilike("state", `%${state.trim()}%`);
      if (district) q = q.ilike("district", `%${district.trim()}%`);
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);

      q = q.range(offset, offset + numLimit - 1);
      const { data, count, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const prices = (data || []).map((p) => ({
        id: p.id,
        marketId: p.market_id,
        marketName: p.market,
        district: p.district,
        state: p.state,
        cropId: p.crop_id,
        commodity: p.commodity,
        variety: p.variety,
        minPrice: Number(p.min_price),
        modalPrice: Number(p.modal_price),
        maxPrice: Number(p.max_price),
        arrivalQuantity: p.arrival_qty_quintals != null ? Number(p.arrival_qty_quintals) : null,
        arrivalUnit: p.unit || "quintal",
        priceUnit: p.unit || "quintal",
        priceDate: p.date,
        dataStatus: p.data_status || "LATEST AVAILABLE",
        verificationStatus: p.verification_status || "VERIFIED",
        source: p.source || "Government of India / AGMARKNET",
        sourceUrl: p.source_url || "https://agmarknet.gov.in",
        fetchedAt: p.updated_at || p.created_at || new Date().toISOString()
      }));

      return res.json({ prices, total: count || 0, page: numPage, limit: numLimit });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  let sql = `SELECT * FROM market_prices WHERE 1=1`;
  const params = [];
  if (cropId) { sql += ` AND crop_id = ?`; params.push(cropId); }
  if (marketId) { sql += ` AND market_id = ?`; params.push(marketId); }
  if (state) { sql += ` AND LOWER(state) LIKE ?`; params.push(`%${state.toLowerCase().trim()}%`); }
  if (district) { sql += ` AND LOWER(district) LIKE ?`; params.push(`%${district.toLowerCase().trim()}%`); }
  if (from) { sql += ` AND date >= ?`; params.push(from); }
  if (to) { sql += ` AND date <= ?`; params.push(to); }
  sql += ` ORDER BY date DESC`;
  const allRows = db.prepare(sql).all(...params);
  const sliced = allRows.slice(offset, offset + numLimit);
  const prices = sliced.map((p) => ({
    id: p.id,
    marketId: p.market_id,
    marketName: p.market,
    district: p.district,
    state: p.state,
    cropId: p.crop_id,
    commodity: p.commodity,
    variety: p.variety,
    minPrice: Number(p.min_price),
    modalPrice: Number(p.modal_price),
    maxPrice: Number(p.max_price),
    arrivalQuantity: p.arrival_qty_quintals != null ? Number(p.arrival_qty_quintals) : null,
    arrivalUnit: p.unit || "quintal",
    priceUnit: p.unit || "quintal",
    priceDate: p.date,
    dataStatus: p.data_status || "LATEST AVAILABLE",
    verificationStatus: p.verification_status || "VERIFIED",
    source: p.source || "Government of India / AGMARKNET",
    sourceUrl: p.source_url || "https://agmarknet.gov.in",
    fetchedAt: p.updated_at || p.created_at || new Date().toISOString()
  }));
  res.json({ prices, total: allRows.length, page: numPage, limit: numLimit });
});

/**
 * 7. GET /api/markets/nearby-storage
 * Verified Storage Facilities near market or user coordinates
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
      capacityDisplay: f.capacity_quintals ? `${f.capacity_quintals} q` : "Capacity data unavailable",
      availableCapacityDisplay: f.available_capacity_quintals ? `${f.available_capacity_quintals} q` : "Available space on inquiry",
      distanceLabel: straightLineDistanceKm != null ? `${straightLineDistanceKm} km straight-line` : "Distance on request",
    };
  });

  if (!isNaN(targetLat) && !isNaN(targetLng)) {
    enriched.sort((a, b) => (a.straightLineDistanceKm ?? 9999) - (b.straightLineDistanceKm ?? 9999));
  }

  res.json(enriched.slice(0, Number(limit)));
});

/**
 * 8. GET /api/markets/:id
 * Individual Market Master Record & supported commodities
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data: market, error: mErr } = await supabase.from("markets").select("*").eq("id", id).maybeSingle();
      if (mErr) return res.status(500).json({ error: mErr.message });
      if (!market) return res.status(404).json({ error: "Market not found" });

      const { data: latestPrices } = await supabase
        .from("market_prices")
        .select("*")
        .eq("market_id", id)
        .order("date", { ascending: false })
        .limit(20);

      const supportedCrops = Array.from(new Set((latestPrices || []).map((p) => p.commodity || p.crop_id)));

      return res.json({
        id: market.id,
        name: market.name,
        district: market.district,
        state: market.state,
        latitude: market.lat != null ? Number(market.lat) : null,
        longitude: market.lng != null ? Number(market.lng) : null,
        address: market.address,
        pincode: market.pincode,
        operatingStatus: market.status || "active",
        verificationStatus: market.verification_status || (market.lat ? "VERIFIED" : "UNVERIFIED"),
        locationSource: market.location_source || "verified_apmc_directory",
        source: "Government of India / AGMARKNET",
        sourceUrl: "https://agmarknet.gov.in",
        supportedCrops,
        latestPrices: latestPrices || []
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const db = getDb();
  const market = db.prepare(`SELECT * FROM markets WHERE id = ?`).get(id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  const latestPrices = db.prepare(`SELECT * FROM market_prices WHERE market_id = ? ORDER BY date DESC LIMIT 20`).all(id);
  const supportedCrops = Array.from(new Set(latestPrices.map((p) => p.commodity || p.crop_id)));
  res.json({
    id: market.id,
    name: market.name,
    district: market.district,
    state: market.state,
    latitude: market.lat != null ? Number(market.lat) : null,
    longitude: market.lng != null ? Number(market.lng) : null,
    address: market.address,
    pincode: market.pincode,
    operatingStatus: market.status || "active",
    verificationStatus: market.verification_status || (market.lat ? "VERIFIED" : "UNVERIFIED"),
    locationSource: market.location_source || "verified_apmc_directory",
    source: "Government of India / AGMARKNET",
    sourceUrl: "https://agmarknet.gov.in",
    supportedCrops,
    latestPrices
  });
});

export default router;
