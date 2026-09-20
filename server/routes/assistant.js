import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { askGemini, buildGroundingContext } from "../lib/gemini.js";
import {
  calcHaversineDistanceKm,
  estimateDistanceKm,
  calcTransportCost,
  calcMarketCharges,
  calcNetRealization
} from "../lib/algorithms.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";

const router = Router();

// Known crop keywords for intent matching
const CROP_SYNONYMS = {
  "cotton": { id: "crop-cotton", name: "Cotton" },
  "kapas": { id: "crop-cotton", name: "Cotton" },
  "pratti": { id: "crop-cotton", name: "Cotton" },
  "onion": { id: "crop-onion", name: "Onion" },
  "pyaz": { id: "crop-onion", name: "Onion" },
  "kanda": { id: "crop-onion", name: "Onion" },
  "ullipaya": { id: "crop-onion", name: "Onion" },
  "chilli": { id: "crop-chilli", name: "Chilli" },
  "mirchi": { id: "crop-chilli", name: "Chilli" },
  "tomato": { id: "crop-tomato", name: "Tomato" },
  "tamatar": { id: "crop-tomato", name: "Tomato" },
  "wheat": { id: "crop-wheat", name: "Wheat" },
  "gehun": { id: "crop-wheat", name: "Wheat" },
  "soybean": { id: "crop-soybean", name: "Soybean" },
  "maize": { id: "crop-maize", name: "Maize" },
  "makka": { id: "crop-maize", name: "Maize" },
  "turmeric": { id: "crop-turmeric", name: "Turmeric" },
  "haldi": { id: "crop-turmeric", name: "Turmeric" },
  "pasupu": { id: "crop-turmeric", name: "Turmeric" },
  "grapes": { id: "crop-grapes", name: "Grapes" },
  "pomegranate": { id: "crop-pomegranate", name: "Pomegranate" },
  "paddy": { id: "crop-paddy", name: "Paddy" },
  "rice": { id: "crop-paddy", name: "Paddy" }
};

// Known location coordinates
const LOCATION_COORDINATES = {
  "bhimavaram": [16.5449, 81.5212],
  "guntur": [16.2974, 80.4578],
  "vijayawada": [16.5062, 80.6480],
  "kurnool": [15.8281, 78.0373],
  "eluru": [16.7107, 81.0952],
  "kakinada": [16.9891, 82.2475],
  "warangal": [17.9689, 79.5941],
  "visakhapatnam": [17.6868, 83.2185],
  "nellore": [14.4426, 79.9865],
  "chittoor": [13.2172, 79.1003],
  "kadapa": [14.4673, 78.8241],
  "anantapur": [14.6819, 77.6006],
  "tenali": [16.2435, 80.6400],
  "duggirala": [16.3262, 80.6278]
};

/**
 * Deterministic rule-based grounded answering engine
 * Used when Gemini API is offline or as baseline ground truth
 */
function deterministicMarketAnswer(question, grounding) {
  const q = question.toLowerCase();

  // If crop was requested but no price data is present
  if (grounding.requestedCrop && (!grounding.prices || grounding.prices.length === 0)) {
    return `I don't have verified current data for this crop/location. As a trusted market assistant, I only report verified government market records.`;
  }

  // Price or selling query for identified crop
  if (grounding.crop && grounding.nearestMarket) {
    const top = grounding.nearestMarket;
    const dateFormatted = top.date || "Latest trading session";
    const others = (grounding.nearbyComparisons || []).slice(0, 3);

    let comparisonText = "";
    if (others.length > 0) {
      comparisonText = `\n\nNearby market comparison:\n` +
        others.map(o => `• ${o.marketName} (${o.district}): ₹${o.modalPrice}/quintal (straight-line distance: ${o.distanceKm} km)`).join("\n");
    }

    return `${grounding.crop.name} price near you:

Nearest verified market:
${top.marketName} (${top.district}) — ${top.distanceKm} km straight-line distance

Latest available:
• Modal price: ₹${top.modalPrice}/quintal
• Minimum: ₹${top.minPrice || top.modalPrice}/quintal
• Maximum: ₹${top.maxPrice || top.modalPrice}/quintal
• Arrival quantity: ${top.arrivalQty ? `${top.arrivalQty} quintals` : "Arrivals recorded"}

Market date:
${dateFormatted}

Source:
${top.source || "Government of India / AGMARKNET"}

Data status:
${top.dataStatus || "LATEST AVAILABLE"}${comparisonText}

Estimated Net Realization: ₹${top.netRealization}/quintal (after documented transport ₹${top.transportCost}/q and mandi charges ₹${top.marketCharges}/q).
Note: Prices fluctuate with daily arrivals and quality grades.`;
  }

  // Nearest mandi generic query
  if (q.includes("nearest") || q.includes("mandi near")) {
    if (grounding.allNearestMarkets && grounding.allNearestMarkets.length > 0) {
      const list = grounding.allNearestMarkets.slice(0, 3).map((m, idx) => 
        `${idx + 1}. ${m.name} (${m.district}) — ${m.distanceKm} km (Verified APMC)`
      ).join("\n");
      return `Nearest verified APMC Mandis based on your location:\n\n${list}\n\nYou can view them on the interactive Mandi Map with live arrival directions.`;
    }
  }

  // Storage query
  if (q.includes("storage") || q.includes("hold") || q.includes("warehouse") || q.includes("cold storage")) {
    if (grounding.storages && grounding.storages.length > 0) {
      const sList = grounding.storages.slice(0, 3).map(s => 
        `• ${s.name} (${s.district}): ₹${s.cost_per_day_per_quintal || 1}/q/day, Space available: ${s.available_capacity_quintals || "Available"}q`
      ).join("\n");
      return `Verified storage facilities near your district:\n\n${sList}\n\nYou can request space or calculate holding cost under the Storage tab.`;
    }
  }

  // Quality grading query
  if (q.includes("grade a") || q.includes("what is grade") || q.includes("quality")) {
    return "Grade A represents FAQ (Fair Average Quality) meeting standard benchmarks: uniform size, optimum moisture (< 12%), less than 3% visual defects, and zero foreign contaminants. Quality grades are verified transparently by FPO field assayers.";
  }

  // Transport calculation explanation
  if (q.includes("transport") && (q.includes("cost") || q.includes("net") || q.includes("affect"))) {
    return "Transport cost is calculated based on distance and shipment quantity, then subtracted from the mandi headline price to determine your Net Realization. Often, a closer mandi with a slightly lower price yields higher take-home profit than a distant mandi once freight charges are factored in.";
  }

  return "Namaste! I am KisanSetu AI Saathi. I answer agricultural market questions using verified government data. Try asking: 'What is the price of 1 quintal cotton near me?', 'Which mandi is nearest?', or 'What is today's onion price?'";
}

/**
 * POST /api/assistant/ask
 * Grounded AI assistant endpoint
 */
const askHandler = async (req, res) => {
  const { question, lotId, cropId, district, userLat, userLng, userId, locale = "en" } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const lowerQ = question.toLowerCase();

  // 1. Identify Crop from question or request parameters
  let identifiedCrop = null;
  if (cropId) {
    identifiedCrop = { id: cropId, name: cropId.replace("crop-", "") };
  } else {
    for (const [kw, c] of Object.entries(CROP_SYNONYMS)) {
      if (lowerQ.includes(kw)) {
        identifiedCrop = c;
        break;
      }
    }
  }

  // 2. Identify Location coordinates from question, request body, or defaults
  let targetCoords = null;
  let targetDistrict = district || "Guntur";

  if (userLat && userLng && !isNaN(Number(userLat)) && !isNaN(Number(userLng))) {
    targetCoords = [Number(userLat), Number(userLng)];
  } else {
    for (const [locName, coords] of Object.entries(LOCATION_COORDINATES)) {
      if (lowerQ.includes(locName)) {
        targetCoords = coords;
        targetDistrict = locName.charAt(0).toUpperCase() + locName.slice(1);
        break;
      }
    }
  }

  if (!targetCoords) {
    targetCoords = LOCATION_COORDINATES[targetDistrict.toLowerCase()] || [16.2974, 80.4578]; // default Guntur
  }

  // 3. Fetch data from Supabase (production) or SQLite (dev)
  let marketsData = [];
  let pricesData = [];
  let storageData = [];

  try {
    if (isProduction) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: mData } = await supabase.from("markets").select("*");
        marketsData = mData || [];

        if (identifiedCrop) {
          const { data: pData } = await supabase
            .from("market_prices")
            .select("*")
            .eq("crop_id", identifiedCrop.id)
            .order("date", { ascending: false });
          pricesData = pData || [];
        } else {
          const { data: pData } = await supabase
            .from("market_prices")
            .select("*")
            .order("date", { ascending: false })
            .limit(30);
          pricesData = pData || [];
        }

        const { data: sData } = await supabase.from("storage_facilities").select("*").limit(5);
        storageData = sData || [];
      }
    } else {
      const db = getDb();
      marketsData = db.prepare(`SELECT * FROM markets`).all();
      if (identifiedCrop) {
        pricesData = db.prepare(`SELECT * FROM market_prices WHERE crop_id = ? ORDER BY date DESC`).all(identifiedCrop.id);
      } else {
        pricesData = db.prepare(`SELECT * FROM market_prices ORDER BY date DESC LIMIT 30`).all();
      }
      storageData = db.prepare(`SELECT * FROM storage_facilities LIMIT 5`).all();
    }
  } catch (dbErr) {
    console.warn("Database lookup error for AI Saathi:", dbErr.message);
  }

  // 4. Deterministic Backend Calculations
  let nearestMarket = null;
  const nearbyComparisons = [];
  const allNearestMarkets = [];

  for (const m of marketsData) {
    const mLat = Number(m.lat || m.latitude);
    const mLng = Number(m.lng || m.longitude);
    if (isNaN(mLat) || isNaN(mLng)) continue;

    const straightDist = calcHaversineDistanceKm(targetCoords[0], targetCoords[1], mLat, mLng);
    allNearestMarkets.push({
      id: m.id,
      name: m.name,
      district: m.district,
      distanceKm: straightDist
    });

    if (identifiedCrop) {
      const priceRow = pricesData.find((p) => p.market_id === m.id);
      if (priceRow) {
        const modal = Number(priceRow.modal_price);
        const transport = calcTransportCost({ distanceKm: Math.round(straightDist * 1.22), quantityQuintals: 1 });
        const charges = calcMarketCharges(modal);
        const net = calcNetRealization({ sellingPrice: modal, transportCost: transport, marketCharges: charges });

        const marketObj = {
          marketId: m.id,
          marketName: m.name,
          district: m.district,
          distanceKm: straightDist,
          modalPrice: modal,
          minPrice: priceRow.min_price || modal,
          maxPrice: priceRow.max_price || modal,
          arrivalQty: priceRow.arrival_qty_quintals,
          date: priceRow.date,
          source: priceRow.source || "Government of India / AGMARKNET",
          dataStatus: priceRow.data_status || "LATEST AVAILABLE",
          transportCost: transport,
          marketCharges: charges,
          netRealization: net
        };

        if (!nearestMarket || straightDist < nearestMarket.distanceKm) {
          nearestMarket = marketObj;
        }
        nearbyComparisons.push(marketObj);
      }
    }
  }

  allNearestMarkets.sort((a, b) => a.distanceKm - b.distanceKm);
  nearbyComparisons.sort((a, b) => a.distanceKm - b.distanceKm);

  if (!nearestMarket && allNearestMarkets.length > 0) {
    const closest = allNearestMarkets[0];
    nearestMarket = {
      marketId: closest.id,
      marketName: closest.name,
      district: closest.district,
      distanceKm: closest.distanceKm,
      source: "Government of India / AGMARKNET APMC Directory",
      dataStatus: "VERIFIED DIRECTORY"
    };
  }

  // 5. Build structured grounding context
  const groundingContext = {
    requestedCrop: identifiedCrop,
    crop: identifiedCrop,
    userLocation: {
      latitude: targetCoords[0],
      longitude: targetCoords[1],
      district: targetDistrict
    },
    nearestMarket,
    nearbyComparisons,
    allNearestMarkets,
    prices: pricesData,
    storages: storageData,
    provenance: "Government of India / AGMARKNET (https://agmarknet.gov.in)"
  };

  // If crop was asked but not present in database
  if (identifiedCrop && (!pricesData || pricesData.length === 0)) {
    return res.json({
      answer: "I don't have verified current data for this crop/location.",
      source: "grounded-verifier",
      configured: Boolean(process.env.GEMINI_API_KEY),
      groundingSummary: {
        crop: identifiedCrop.name,
        verifiedRecordsFound: 0
      }
    });
  }

  // 6. Invoke Gemini if key is configured, with structured grounding
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  if (hasGeminiKey) {
    const formattedPrompt = `GROUNDING DATA CONTEXT (FROM VERIFIED SUPABASE DATABASE):
Crop: ${identifiedCrop?.name || "General Mandi Discovery"}
User Location: ${targetDistrict} (${targetCoords[0].toFixed(4)}, ${targetCoords[1].toFixed(4)})
Nearest Mandi: ${nearestMarket ? `${nearestMarket.marketName} (${nearestMarket.district}) - ${nearestMarket.distanceKm} km straight-line distance${nearestMarket.modalPrice ? `, Modal: ₹${nearestMarket.modalPrice}/q, Min: ₹${nearestMarket.minPrice}, Max: ₹${nearestMarket.maxPrice}, Date: ${nearestMarket.date}, Status: ${nearestMarket.dataStatus}, Source: ${nearestMarket.source}` : ""}` : "None verified"}
Nearby Comparisons: ${nearbyComparisons.slice(0, 3).map(c => `${c.marketName}: ₹${c.modalPrice}/q (${c.distanceKm} km)`).join("; ")}
Storage Facilities: ${storageData.slice(0, 2).map(s => `${s.name}: ₹${s.cost_per_day_per_quintal}/q/day`).join("; ")}

INSTRUCTION TO AI SAATHI:
Explain the factual findings above concisely and clearly to the user in response to their question.
Use the EXACT numbers from the grounding data. Do not hallucinate or guess any other price numbers.
Include data source, date, and data status.`;

    const aiResult = await askGemini({
      question,
      context: formattedPrompt,
      locale
    });

    if (aiResult.success) {
      return res.json({
        answer: aiResult.text,
        source: aiResult.source || "gemini",
        configured: true,
        groundingSummary: {
          crop: identifiedCrop?.name,
          nearestMarket: nearestMarket?.marketName,
          modalPrice: nearestMarket?.modalPrice,
          straightLineDistanceKm: nearestMarket?.distanceKm,
          status: nearestMarket?.dataStatus || "LATEST AVAILABLE"
        }
      });
    }
  }

  // Deterministic rule engine fallback
  const answer = deterministicMarketAnswer(question, groundingContext);
  return res.json({
    answer,
    source: "grounded-deterministic",
    configured: hasGeminiKey,
    groundingSummary: {
      crop: identifiedCrop?.name,
      nearestMarket: nearestMarket?.marketName,
      modalPrice: nearestMarket?.modalPrice,
      straightLineDistanceKm: nearestMarket?.distanceKm,
      status: nearestMarket?.dataStatus || "LATEST AVAILABLE"
    }
  });
};

router.post("/ask", askHandler);
router.post("/chat", askHandler);

export default router;
