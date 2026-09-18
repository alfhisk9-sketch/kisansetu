// ============================================================
// KrishiSetu Market — Core Deterministic Algorithms
// No AI/LLM calls happen anywhere in this file, by design.
// Every number here is derived from structured data + rules.
// ============================================================

/**
 * Approximate road distance (km) between two markets using a small
 * static lookup of district-level distances (currently Andhra Pradesh
 * districts for this deployment's demo data). Falls back to
 * a coarse estimate if the pair isn't in the table. This avoids paid
 * mapping APIs, per the prototype's cost constraints.
 */
export function estimateDistanceKm(distanceTable, fromDistrict, toDistrict) {
  if (fromDistrict === toDistrict) return distanceTable._sameDistrictKm ?? 20;
  const key1 = `${fromDistrict}|${toDistrict}`;
  const key2 = `${toDistrict}|${fromDistrict}`;
  return distanceTable[key1] ?? distanceTable[key2] ?? 120; // generic fallback
}

/**
 * Haversine formula for straight-line geographic distance between two lat/lng coordinates (km).
 * Used for accurate distance estimation between farmer location, mandis, and storage facilities.
 */
export function calcHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

  const R = 6371; // Earth radius in km
  const dLat = ((nLat2 - nLat1) * Math.PI) / 180;
  const dLon = ((nLon2 - nLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((nLat1 * Math.PI) / 180) *
      Math.cos((nLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Transport cost formula (rule-based, not an external API):
 * base loading/unloading charge + per-km-per-quintal rate,
 * with a minimum-load efficiency factor for small quantities.
 */
export function calcTransportCost({ distanceKm, quantityQuintals, ratePerKmPerQuintal = 0.9, baseHandlingPerQuintal = 15 }) {
  const perQuintal = baseHandlingPerQuintal + distanceKm * ratePerKmPerQuintal * (quantityQuintals < 20 ? 1.25 : 1);
  return Math.round(perQuintal * 100) / 100; // ₹ per quintal
}

/**
 * Market/mandi charges: APMC cess + commission + weighment, expressed
 * as a percentage of modal price plus a small flat handling fee.
 */
export function calcMarketCharges(price, { cessPct = 0.01, commissionPct = 0.02, handlingFlat = 10 } = {}) {
  return Math.round((price * (cessPct + commissionPct) + handlingFlat) * 100) / 100;
}

/**
 * NET REALIZATION = Selling Price - Transport - Market Charges - Handling - Storage(optional)
 */
export function calcNetRealization({ sellingPrice, transportCost, marketCharges, storageCost = 0 }) {
  const net = sellingPrice - transportCost - marketCharges - storageCost;
  return Math.round(net * 100) / 100;
}

/**
 * Simple moving average trend over a price series (array of {date, modal_price} ascending by date).
 */
export function calcTrend(series, windowDays) {
  if (!series.length) return { average: null, changePct: null };
  const recent = series.slice(-windowDays);
  const avg = recent.reduce((s, r) => s + r.modal_price, 0) / recent.length;
  const first = recent[0].modal_price;
  const last = recent[recent.length - 1].modal_price;
  const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
  return { average: Math.round(avg * 100) / 100, changePct: Math.round(changePct * 100) / 100 };
}

export function calcVolatility(series) {
  if (series.length < 2) return 0;
  const prices = series.map((r) => r.modal_price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  const stdev = Math.sqrt(variance);
  return Math.round((stdev / mean) * 1000) / 10; // coefficient of variation, %
}

/**
 * Score a single market/buyer option for a farmer's lot on a 0-100 scale,
 * broken into transparent named components (used to power the
 * "Recommended because..." explanation UI).
 *
 * Weights sum to 100:
 *  Price Score        35
 *  Logistics Score     20
 *  Demand Score        20
 *  Quality Match Score 15
 *  Storage/Timing      10
 */
export function scoreSellingOption({
  netRealization,
  maxNetRealizationInSet,
  minNetRealizationInSet,
  distanceKm,
  maxDistanceInSet,
  demandLevel, // 'Low' | 'Medium' | 'High'
  qualityMeetsRequirement, // boolean
  trendChangePct,
}) {
  const priceRange = Math.max(maxNetRealizationInSet - minNetRealizationInSet, 1);
  const priceScore = 35 * ((netRealization - minNetRealizationInSet) / priceRange);

  const distRange = Math.max(maxDistanceInSet, 1);
  const logisticsScore = 20 * (1 - distanceKm / distRange);

  const demandMap = { Low: 0.3, Medium: 0.65, High: 1 };
  const demandScore = 20 * (demandMap[demandLevel] ?? 0.5);

  const qualityScore = qualityMeetsRequirement ? 15 : 6;

  const trendBonus = trendChangePct > 0 ? Math.min(trendChangePct / 2, 10) : Math.max(trendChangePct / 2, -10);
  const timingScore = 10 * (0.5 + trendBonus / 20); // centered around 5, +/- up to 10

  const total = priceScore + logisticsScore + demandScore + qualityScore + Math.max(0, Math.min(10, timingScore));

  return {
    total: Math.round(total * 10) / 10,
    components: {
      priceScore: Math.round(priceScore * 10) / 10,
      logisticsScore: Math.round(logisticsScore * 10) / 10,
      demandScore: Math.round(demandScore * 10) / 10,
      qualityScore: Math.round(qualityScore * 10) / 10,
      timingScore: Math.round(Math.max(0, Math.min(10, timingScore)) * 10) / 10,
    },
  };
}

/**
 * Buyer <-> Lot match score (0-100), per the spec's weighting:
 * Crop match 25, Quality match 20, Quantity compatibility 15,
 * Price attractiveness 20, Distance/logistics 10, Delivery timing 10.
 */
export function scoreBuyerMatch({
  cropMatches,
  gradeRequired,
  lotGrade,
  demandQty,
  lotQty,
  offerPrice,
  benchmarkPrice,
  distanceKm,
  maxDistanceInSet,
  requiredByDate,
  availableFromDate,
}) {
  const cropScore = cropMatches ? 25 : 0;

  const gradeOrder = { A: 3, B: 2, C: 1 };
  let qualityScore = 0;
  if (gradeRequired && lotGrade) {
    if (gradeRequired === lotGrade) qualityScore = 20;
    else if (gradeOrder[lotGrade] > gradeOrder[gradeRequired]) qualityScore = 17; // over-delivers on quality
    else qualityScore = 8; // below requirement
  } else {
    qualityScore = 14;
  }

  const qtyRatio = Math.min(lotQty, demandQty) / Math.max(lotQty, demandQty, 1);
  const quantityScore = 15 * qtyRatio;

  const priceRatio = benchmarkPrice > 0 ? offerPrice / benchmarkPrice : 1;
  const priceScore = 20 * Math.max(0, Math.min(1.15, priceRatio)) / 1.15;

  const distRange = Math.max(maxDistanceInSet, 1);
  const logisticsScore = 10 * (1 - Math.min(distanceKm, distRange) / distRange);

  let timingScore = 10;
  if (requiredByDate && availableFromDate) {
    const req = new Date(requiredByDate).getTime();
    const avail = new Date(availableFromDate).getTime();
    timingScore = avail <= req ? 10 : 3;
  }

  const total = cropScore + qualityScore + quantityScore + priceScore + logisticsScore + timingScore;

  return {
    total: Math.round(total * 10) / 10,
    components: {
      cropScore,
      qualityScore: Math.round(qualityScore * 10) / 10,
      quantityScore: Math.round(quantityScore * 10) / 10,
      priceScore: Math.round(priceScore * 10) / 10,
      logisticsScore: Math.round(logisticsScore * 10) / 10,
      timingScore,
    },
  };
}

/**
 * Simple manual quality grading: transparent rule table, no computer vision.
 */
export function computeGrade({ sizeRating, moistureRating, damagePct, foreignMaterialPct, appearanceRating }) {
  const goodCount = [sizeRating, moistureRating, appearanceRating].filter((r) => r === "Good").length;

  if (damagePct <= 3 && foreignMaterialPct <= 2 && goodCount >= 3) return "A";
  if (damagePct <= 8 && foreignMaterialPct <= 5 && goodCount >= 2) return "B";
  return "C";
}

/**
 * Sell-now vs store-and-sell-later comparison. Deliberately hedged
 * language: this is a scenario estimate, not a guarantee.
 */
export function compareStoreVsSellNow({
  currentNetRealization,
  projectedFuturePrice, // derived from historical seasonal trend, not a "prediction"
  storageDays,
  storageCostPerDayPerQuintal,
  additionalTransportPerQuintal = 0,
  marketChargesOnFuturePrice,
}) {
  const storageCost = storageDays * storageCostPerDayPerQuintal;
  const futureNet = projectedFuturePrice - marketChargesOnFuturePrice - storageCost - additionalTransportPerQuintal;
  return {
    sellNowNet: Math.round(currentNetRealization * 100) / 100,
    storeAndSellNet: Math.round(futureNet * 100) / 100,
    storageCost: Math.round(storageCost * 100) / 100,
    differenceVsSellNow: Math.round((futureNet - currentNetRealization) * 100) / 100,
  };
}
