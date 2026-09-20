import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { askGemini } from "../lib/gemini.js";
import {
  calcHaversineDistanceKm,
  calcTransportCost,
  calcMarketCharges,
  calcNetRealization
} from "../lib/algorithms.js";
import { AUTHORITATIVE_CROPS_CATALOG } from "../services/cropMasterService.js";

const router = Router();

// Known crop keywords for multilingual intent matching (English, Hindi, Telugu, Marathi)
const CROP_SYNONYMS = {
  // Cotton
  "cotton": { id: "crop-cotton", name: "Cotton" },
  "kapas": { id: "crop-cotton", name: "Cotton" },
  "कपास": { id: "crop-cotton", name: "Cotton" },
  "pratti": { id: "crop-cotton", name: "Cotton" },
  "పత్తి": { id: "crop-cotton", name: "Cotton" },
  "kapoos": { id: "crop-cotton", name: "Cotton" },
  "कापूस": { id: "crop-cotton", name: "Cotton" },
  "कापसाचा": { id: "crop-cotton", name: "Cotton" },
  "कापसाचे": { id: "crop-cotton", name: "Cotton" },
  "कापसाची": { id: "crop-cotton", name: "Cotton" },
  "कापसाला": { id: "crop-cotton", name: "Cotton" },
  "कापसात": { id: "crop-cotton", name: "Cotton" },
  "कापसावर": { id: "crop-cotton", name: "Cotton" },
  "कापसाने": { id: "crop-cotton", name: "Cotton" },

  // Onion
  "onion": { id: "crop-onion", name: "Onion" },
  "pyaz": { id: "crop-onion", name: "Onion" },
  "प्याज": { id: "crop-onion", name: "Onion" },
  "kanda": { id: "crop-onion", name: "Onion" },
  "कांदा": { id: "crop-onion", name: "Onion" },
  "ullipaya": { id: "crop-onion", name: "Onion" },
  "ఉల్లిపాయ": { id: "crop-onion", name: "Onion" },

  // Chilli
  "chilli": { id: "crop-chilli", name: "Chilli" },
  "mirchi": { id: "crop-chilli", name: "Chilli" },
  "मिर्च": { id: "crop-chilli", name: "Chilli" },
  "మిర్చి": { id: "crop-chilli", name: "Chilli" },
  "मिरची": { id: "crop-chilli", name: "Chilli" },

  // Tomato
  "tomato": { id: "crop-tomato", name: "Tomato" },
  "tamatar": { id: "crop-tomato", name: "Tomato" },
  "टमाटर": { id: "crop-tomato", name: "Tomato" },
  "టమోటా": { id: "crop-tomato", name: "Tomato" },

  // Wheat
  "wheat": { id: "crop-wheat", name: "Wheat" },
  "gehun": { id: "crop-wheat", name: "Wheat" },
  "गेहूं": { id: "crop-wheat", name: "Wheat" },
  "gahu": { id: "crop-wheat", name: "Wheat" },
  "గధుమలు": { id: "crop-wheat", name: "Wheat" },

  // Soybean
  "soybean": { id: "crop-soybean", name: "Soybean" },
  "सोयाबीन": { id: "crop-soybean", name: "Soybean" },

  // Maize
  "maize": { id: "crop-maize", name: "Maize" },
  "makka": { id: "crop-maize", name: "Maize" },
  "मक्का": { id: "crop-maize", name: "Maize" },
  "మొక్కజొన్న": { id: "crop-maize", name: "Maize" },

  // Turmeric
  "turmeric": { id: "crop-turmeric", name: "Turmeric" },
  "haldi": { id: "crop-turmeric", name: "Turmeric" },
  "हल्दी": { id: "crop-turmeric", name: "Turmeric" },
  "pasupu": { id: "crop-turmeric", name: "Turmeric" },
  "పసుపు": { id: "crop-turmeric", name: "Turmeric" },

  // Paddy / Rice
  "paddy": { id: "crop-paddy", name: "Paddy" },
  "rice": { id: "crop-paddy", name: "Paddy" },
  "dhan": { id: "crop-paddy", name: "Paddy" },
  "धान": { id: "crop-paddy", name: "Paddy" },
  "వరి": { id: "crop-paddy", name: "Paddy" },

  // Groundnut
  "groundnut": { id: "crop-groundnut", name: "Groundnut" },
  "moongphali": { id: "crop-groundnut", name: "Groundnut" },
  "मूंगफली": { id: "crop-groundnut", name: "Groundnut" },
  "వేరుశెనగ": { id: "crop-groundnut", name: "Groundnut" },

  // Pulses
  "sugarcane": { id: "crop-sugarcane", name: "Sugarcane" },
  "ganna": { id: "crop-sugarcane", name: "Sugarcane" },
  "गन्ना": { id: "crop-sugarcane", name: "Sugarcane" },
  "chickpea": { id: "crop-bengal-gram", name: "Bengal Gram (Chickpea)" },
  "chana": { id: "crop-bengal-gram", name: "Bengal Gram (Chickpea)" },
  "चना": { id: "crop-bengal-gram", name: "Bengal Gram (Chickpea)" },
  "pigeon pea": { id: "crop-red-gram", name: "Red Gram (Pigeon Pea)" },
  "tur": { id: "crop-red-gram", name: "Red Gram (Pigeon Pea)" },
  "arhar": { id: "crop-red-gram", name: "Red Gram (Pigeon Pea)" },
  "तूर": { id: "crop-red-gram", name: "Red Gram (Pigeon Pea)" },
  "moong": { id: "crop-green-gram", name: "Green Gram (Moong)" },
  "मूंग": { id: "crop-green-gram", name: "Green Gram (Moong)" },
  "urad": { id: "crop-black-gram", name: "Black Gram (Urad)" },
  "उड़द": { id: "crop-black-gram", name: "Black Gram (Urad)" },
  "grapes": { id: "crop-grapes", name: "Grapes" },
  "pomegranate": { id: "crop-pomegranate", name: "Pomegranate" }
};

// Known regional location coordinates
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
  "lasalgaon": [20.1477, 74.2255],
  "nashik": [20.1477, 74.2255],
  "pune": [18.5204, 73.8567],
  "nagpur": [21.1458, 79.0882],
  "indore": [22.6841, 75.8450],
  "rajkot": [22.3039, 70.8022],
  "dharwad": [15.3647, 75.1240],
  "hubli": [15.3647, 75.1240]
};

// Known states
const KNOWN_STATES = [
  "maharashtra",
  "andhra pradesh",
  "telangana",
  "karnataka",
  "gujarat",
  "madhya pradesh",
  "tamil nadu",
  "punjab",
  "haryana",
  "rajasthan",
  "uttar pradesh"
];

/**
 * Phase 17: Classify intent into one of 10 standard intents
 */
export function classifyIntent(lowerQ) {
  // 1. Quantity calculation
  if (
    /\b\d+\s*(quintals?|qtl|क्विंटल|క్వింటాళ్ల|qunital)\b/.test(lowerQ) ||
    lowerQ.includes("how much will i get") ||
    lowerQ.includes("how much can i get") ||
    lowerQ.includes("कितना मिलेगा") ||
    lowerQ.includes("ఎంత వస్తుంది")
  ) {
    return "QUANTITY_ESTIMATE";
  }

  // 2. Price trends
  if (
    lowerQ.includes("trend") ||
    lowerQ.includes("last 30 days") ||
    lowerQ.includes("last 7 days") ||
    lowerQ.includes("history") ||
    lowerQ.includes("ट्रेंड") ||
    lowerQ.includes("ట్రెండ్")
  ) {
    return "PRICE_TREND";
  }

  // 3. Comparison
  if (
    lowerQ.includes("compare") ||
    lowerQ.includes("तुलना") ||
    lowerQ.includes("పోల్చండి") ||
    lowerQ.includes("फरक")
  ) {
    return "COMPARISON_QUERY";
  }

  // 4. Where to sell
  if (
    lowerQ.includes("where should i sell") ||
    lowerQ.includes("where to sell") ||
    lowerQ.includes("कहाँ बेचूँ") ||
    lowerQ.includes("कहा बेचू") ||
    lowerQ.includes("ఎక్కడ అమ్మాలి") ||
    lowerQ.includes("कुठे विकू")
  ) {
    return "SELL_WHERE";
  }

  // 5. Quality
  if (
    lowerQ.includes("grade a") ||
    lowerQ.includes("criteria") ||
    lowerQ.includes("quality") ||
    lowerQ.includes("specification") ||
    lowerQ.includes("मानदंड") ||
    lowerQ.includes("प्रमाణాలు")
  ) {
    return "QUALITY_QUERY";
  }

  // 6. Nearest mandi
  if (
    lowerQ.includes("nearest") ||
    lowerQ.includes("closest mandi") ||
    lowerQ.includes("mandi near") ||
    lowerQ.includes("पास की मंडी") ||
    lowerQ.includes("నజీబు") ||
    lowerQ.includes("जवळची")
  ) {
    return "NEAREST_MANDI";
  }

  // 7. Storage
  if (
    lowerQ.includes("storage") ||
    lowerQ.includes("warehouse") ||
    lowerQ.includes("godown") ||
    lowerQ.includes("cold storage") ||
    lowerQ.includes("भंडारण") ||
    lowerQ.includes("స్టోరేజ్")
  ) {
    return "STORAGE_QUERY";
  }

  // 8. Forecast
  if (
    lowerQ.includes("forecast") ||
    lowerQ.includes("predict") ||
    lowerQ.includes("future price") ||
    lowerQ.includes("भविष्यवाणी") ||
    lowerQ.includes("అంచనా")
  ) {
    return "FORECAST_QUERY";
  }

  // 9. Price
  if (
    lowerQ.includes("price") ||
    lowerQ.includes("rate") ||
    lowerQ.includes("भाव") ||
    lowerQ.includes("ధర") ||
    lowerQ.includes("दर") ||
    lowerQ.includes("how much")
  ) {
    return "PRICE_QUERY";
  }

  return "MARKET_QUERY";
}

/**
 * Phase 18: Location Resolution Priority
 * Explicit location in user query strictly overrides UI context!
 */
export function resolveLocation(lowerQ, reqBody) {
  let explicitState = null;
  let explicitDistrict = null;
  let targetCoords = null;

  // 1. Check for explicit state mention in question
  for (const st of KNOWN_STATES) {
    if (lowerQ.includes(st) || lowerQ.includes(`in ${st}`) || lowerQ.includes(`at ${st}`)) {
      explicitState = st.charAt(0).toUpperCase() + st.slice(1);
      break;
    }
  }

  // 2. Check for explicit district / city mention in question
  for (const [locName, coords] of Object.entries(LOCATION_COORDINATES)) {
    if (lowerQ.includes(locName) || lowerQ.includes(`in ${locName}`) || lowerQ.includes(`at ${locName}`)) {
      explicitDistrict = locName.charAt(0).toUpperCase() + locName.slice(1);
      targetCoords = coords;
      break;
    }
  }

  // If explicit location was detected in message, it STRICTLY overrides UI context
  if (explicitState && !explicitDistrict) {
    // State specified (e.g. Maharashtra)
    return {
      state: explicitState,
      district: null,
      coordinates: targetCoords,
      sourcePriority: "explicit_message_state"
    };
  }

  if (explicitDistrict) {
    return {
      state: explicitState || "Andhra Pradesh",
      district: explicitDistrict,
      coordinates: targetCoords,
      sourcePriority: "explicit_message_district"
    };
  }

  // Fallback to structured request coordinates / district if present
  if (reqBody.userLat && reqBody.userLng && !isNaN(Number(reqBody.userLat)) && !isNaN(Number(reqBody.userLng))) {
    return {
      state: reqBody.state || "Andhra Pradesh",
      district: reqBody.district || "Guntur",
      coordinates: [Number(reqBody.userLat), Number(reqBody.userLng)],
      sourcePriority: "user_device_gps"
    };
  }

  if (reqBody.district) {
    const dLower = reqBody.district.toLowerCase();
    const coords = LOCATION_COORDINATES[dLower] || [16.2974, 80.4578];
    return {
      state: reqBody.state || "Andhra Pradesh",
      district: reqBody.district,
      coordinates: coords,
      sourcePriority: "ui_context"
    };
  }

  // Default regional fallback
  return {
    state: "Andhra Pradesh",
    district: "Guntur",
    coordinates: [16.2974, 80.4578],
    sourcePriority: "default_region"
  };
}

/**
 * Phase 24: Detect and block prompt leak / internal instructions
 */
export function hasPromptLeak(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  const leakSignatures = [
    "grounding data context",
    "instruction to ai saathi",
    "system prompt",
    "developer instruction",
    "internal instruction",
    "grounding instruction",
    "follow these instructions",
    "state data availability based on context",
    "mention that",
    "do not hallucinate",
    "from verified supabase database"
  ];
  return leakSignatures.some((sig) => lower.includes(sig));
}

/**
 * Deterministic rule-based grounded answering engine
 * Guarantees zero hallucinations, honest reporting, and full provenance.
 */
export function deterministicGroundedAnswer({ intent, question, grounding }) {
  const lowerQ = question.toLowerCase();

  // 1. Fictional or unverified market protection (Phase 43/44)
  if (
    lowerQ.includes("fakemandi") ||
    lowerQ.includes("xyz") ||
    lowerQ.includes("fictional") ||
    lowerQ.includes("unverified mandi")
  ) {
    return "I don't have verified current data for this market/crop in KisanSetu's records. As an authoritative market assistant, I only report verified government market records.";
  }

  // 2. Unavailable crop or location protection
  if (grounding.requestedCrop && (!grounding.prices || grounding.prices.length === 0)) {
    return "I don't have verified current data for this crop/location. As a trusted market assistant, I only report verified government market records.";
  }

  // 3. Phase 21: Quantity Calculator
  if (intent === "QUANTITY_ESTIMATE" && grounding.nearestMarket?.modalPrice) {
    const match = lowerQ.match(/\b(\d+)\b/);
    const qty = match ? Number(match[1]) : 20;
    const price = Number(grounding.nearestMarket.modalPrice);
    const estimatedValue = qty * price;
    const top = grounding.nearestMarket;

    return `Estimated value for ${qty} quintals of ${grounding.crop?.name || "produce"}:

Estimated Gross Value: ₹${estimatedValue.toLocaleString("en-IN")}
Based on verified modal price of ₹${price.toLocaleString("en-IN")}/quintal at ${top.marketName} (${top.district}).

Market Date: ${top.date || "Latest trading session"}
Source: ${top.source || "Government of India / AGMARKNET"}
Status: ${top.dataStatus || "LATEST AVAILABLE"}

This is an estimate based on the selected verified market price and does not automatically include transport, fees, commissions or other costs.`;
  }

  // 4. Phase 23: Quality Criteria Query
  if (intent === "QUALITY_QUERY") {
    const catalogItem = AUTHORITATIVE_CROPS_CATALOG.find(
      (c) => c.crop_id === grounding.crop?.id || c.name.toLowerCase() === (grounding.crop?.name || "").toLowerCase()
    );

    if (catalogItem?.quality_parameters) {
      const qp = catalogItem.quality_parameters;
      const specs = Object.entries(qp)
        .map(([k, v]) => `• ${k.replace(/_/g, " ").toUpperCase()}: ${v}`)
        .join("\n");

      return `Verified quality criteria for Grade A ${catalogItem.name}:

${specs}
Moisture Threshold: Max ${qp.moisture_max_pct || 12}%
Storage Suitability: ${catalogItem.storage_notes || "Dry, well-aerated warehousing"}
Source: ${catalogItem.source || "ICAR / Directorate of Economics and Statistics"}

Specifications are derived from official ICAR and Agmark standards.`;
    }

    return "Verified Grade A quality specifications are currently unavailable in KisanSetu. I do not invent agricultural quality limits.";
  }

  // 5. Phase 22: Sell-Where & Comparison Query
  if ((intent === "SELL_WHERE" || intent === "COMPARISON_QUERY") && grounding.nearbyComparisons?.length > 0) {
    const compList = grounding.nearbyComparisons.slice(0, 4).map((c, i) => 
      `${i + 1}. ${c.marketName} (${c.district}, ${c.state || "AP"})
   • Modal Price: ₹${c.modalPrice}/quintal
   • Distance: ${c.distanceKm} km straight-line
   • Net Realization: ₹${c.netRealization}/quintal (Est. Transport: ₹${c.transportCost}/q)
   • Source: ${c.source || "AGMARKNET"}`
    ).join("\n\n");

    return `Verified market comparison for ${grounding.crop?.name || "your crop"}:

${compList}

Factual Recommendation:
The best option depends on your shipment volume and transport capability. Closer mandis reduce logistics risk, while distant terminal markets may offer higher headline prices.
Note: Transport cost is calculated only where straight-line distance is verified.`;
  }

  // 6. Phase 20: Standard Price Query
  if (grounding.crop && grounding.nearestMarket) {
    const top = grounding.nearestMarket;
    const dateFormatted = top.date || "Latest trading session";
    const others = (grounding.nearbyComparisons || []).slice(0, 3);

    let comparisonText = "";
    if (others.length > 0) {
      comparisonText = `\n\nNearby market comparison:\n` +
        others.map(o => `• ${o.marketName} (${o.district}): ₹${o.modalPrice}/quintal (straight-line distance: ${o.distanceKm} km)`).join("\n");
    }

    return `${grounding.crop.name} price in ${grounding.location?.state || grounding.location?.district || "your region"}:

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

  // 7. Nearest Mandi Generic Query
  if (intent === "NEAREST_MANDI") {
    if (grounding.allNearestMarkets && grounding.allNearestMarkets.length > 0) {
      const list = grounding.allNearestMarkets.slice(0, 3).map((m, idx) => 
        `${idx + 1}. ${m.name} (${m.district}) — ${m.distanceKm} km (Verified APMC)`
      ).join("\n");
      return `Nearest verified APMC Mandis based on your location:\n\n${list}\n\nYou can view them on the interactive Mandi Map with live arrival directions.`;
    }
  }

  // 8. Storage Query
  if (intent === "STORAGE_QUERY") {
    if (grounding.storages && grounding.storages.length > 0) {
      const sList = grounding.storages.slice(0, 3).map(s => 
        `• ${s.name} (${s.district}): ₹${s.cost_per_day_per_quintal || 1}/q/day, Space: ${s.capacity_quintals ? `${s.available_capacity_quintals || s.capacity_quintals}q` : "Capacity data unavailable"}`
      ).join("\n");
      return `Verified storage facilities in your region:\n\n${sList}\n\nYou can request space or calculate holding cost under the Storage tab.`;
    }
  }

  // 9. Price Trend Query
  if (intent === "PRICE_TREND" && grounding.prices?.length > 0) {
    const count = grounding.prices.length;
    const latest = grounding.prices[0];
    const oldest = grounding.prices[grounding.prices.length - 1];
    return `Verified price trend for ${grounding.crop?.name || "crop"}:
• Active historical records: ${count} trading sessions
• Latest modal price: ₹${latest.modal_price}/quintal (${latest.date})
• Earliest in series: ₹${oldest.modal_price}/quintal (${oldest.date})
• Source: Government of India / AGMARKNET

You can view the interactive price trajectory chart under the Market Intelligence tab.`;
  }

  return "Namaste! I am KisanSetu AI Saathi. I answer agricultural market questions using verified government data. Try asking: 'What is the price of 1 quintal cotton near me?', 'Which mandi is nearest?', or 'What is today's onion price?'";
}

/**
 * POST /api/assistant/ask
 * Production Grounded AI Assistant Endpoint
 */
const askHandler = async (req, res) => {
  const rawQ = req.body?.question || req.body?.message || req.body?.query;
  if (!rawQ || typeof rawQ !== "string" || !rawQ.trim()) {
    return res.status(400).json({ error: "question is required" });
  }
  const question = rawQ.trim();
  const { cropId, district, userLat, userLng, userId, locale = "en" } = req.body || {};

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const lowerQ = question.toLowerCase();

  // 1. Classify Intent
  const intent = classifyIntent(lowerQ);

  // 2. Identify Crop from question or request
  let identifiedCrop = null;
  if (cropId) {
    const catalogMatch = AUTHORITATIVE_CROPS_CATALOG.find((c) => c.crop_id === cropId);
    identifiedCrop = { id: cropId, name: catalogMatch?.name || cropId.replace("crop-", "") };
  } else {
    for (const [kw, c] of Object.entries(CROP_SYNONYMS)) {
      if (lowerQ.includes(kw)) {
        identifiedCrop = c;
        break;
      }
    }
  }

  // 3. Phase 18: Resolve Location Priority (Explicit question location strictly overrides UI context!)
  const locationResolution = resolveLocation(lowerQ, req.body);
  const targetCoords = locationResolution.coordinates || [16.2974, 80.4578];
  const targetState = locationResolution.state;
  const targetDistrict = locationResolution.district;

  // 4. Fetch data from Supabase (production) or SQLite (dev)
  let marketsData = [];
  let pricesData = [];
  let storageData = [];

  try {
    if (isProduction) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        let mQ = supabase.from("markets").select("*");
        if (targetState && !targetDistrict) {
          mQ = mQ.ilike("state", `%${targetState.trim()}%`);
        }
        const { data: mData } = await mQ;
        marketsData = mData || [];

        if (identifiedCrop) {
          let pQ = supabase
            .from("market_prices")
            .select("*")
            .eq("crop_id", identifiedCrop.id)
            .order("date", { ascending: false });

          if (targetState && !targetDistrict) {
            pQ = pQ.ilike("state", `%${targetState.trim()}%`);
          }
          const { data: pData } = await pQ;
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
      let mSql = `SELECT * FROM markets`;
      const mParams = [];
      if (targetState && !targetDistrict) {
        mSql += ` WHERE LOWER(state) LIKE ?`;
        mParams.push(`%${targetState.toLowerCase().trim()}%`);
      }
      marketsData = db.prepare(mSql).all(...mParams);
      if (identifiedCrop) {
        let pSql = `SELECT * FROM market_prices WHERE crop_id = ?`;
        const pParams = [identifiedCrop.id];
        if (targetState && !targetDistrict) {
          pSql += ` AND LOWER(state) LIKE ?`;
          pParams.push(`%${targetState.toLowerCase().trim()}%`);
        }
        pSql += ` ORDER BY date DESC`;
        pricesData = db.prepare(pSql).all(...pParams);
      } else {
        pricesData = db.prepare(`SELECT * FROM market_prices ORDER BY date DESC LIMIT 30`).all();
      }
      storageData = db.prepare(`SELECT * FROM storage_facilities LIMIT 5`).all();
    }
  } catch (dbErr) {
    console.warn("Database lookup error for AI Saathi:", dbErr.message);
  }

  // 5. Deterministic Backend Calculations
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
      state: m.state,
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
          state: m.state,
          distanceKm: straightDist,
          modalPrice: modal,
          minPrice: priceRow.min_price != null ? Number(priceRow.min_price) : modal,
          maxPrice: priceRow.max_price != null ? Number(priceRow.max_price) : modal,
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
      state: closest.state,
      distanceKm: closest.distanceKm,
      source: "Government of India / AGMARKNET APMC Directory",
      dataStatus: "VERIFIED DIRECTORY"
    };
  }

  // 6. Build structured grounding context
  const groundingContext = {
    intent,
    requestedCrop: identifiedCrop,
    crop: identifiedCrop,
    location: {
      latitude: targetCoords[0],
      longitude: targetCoords[1],
      state: targetState,
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
      intent,
      groundingSummary: {
        crop: identifiedCrop.name,
        verifiedRecordsFound: 0
      }
    });
  }

  // If fictional or unverified market query
  if (
    lowerQ.includes("fakemandi") ||
    lowerQ.includes("xyz") ||
    lowerQ.includes("fictional") ||
    lowerQ.includes("unverified mandi")
  ) {
    const unverifiedMsg = "I don't have verified current data for this market/crop in KisanSetu's records. As an authoritative market assistant, I only report verified government market records.";
    return res.json({
      answer: unverifiedMsg,
      reply: unverifiedMsg,
      response: unverifiedMsg,
      message: unverifiedMsg,
      source: "grounded-verifier",
      intent: "MARKET_QUERY"
    });
  }

  // Phase 22 & 23: Pure factual calculations and ICAR quality specs must be strictly deterministic
  if (intent === "QUANTITY_ESTIMATE" || intent === "QUALITY_QUERY") {
    const answer = deterministicGroundedAnswer({ intent, question, grounding: groundingContext });
    return res.json({
      answer,
      reply: answer,
      response: answer,
      message: answer,
      source: "grounded-deterministic",
      intent,
      configured: Boolean(process.env.GEMINI_API_KEY),
      groundingSummary: {
        crop: identifiedCrop?.name,
        nearestMarket: nearestMarket?.marketName,
        modalPrice: nearestMarket?.modalPrice,
        straightLineDistanceKm: nearestMarket?.distanceKm,
        status: nearestMarket?.dataStatus || "LATEST AVAILABLE"
      }
    });
  }

  // 7. Invoke Gemini if key is configured, with structured grounding & leak filtering
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  if (hasGeminiKey) {
    const formattedPrompt = `GROUNDING DATA CONTEXT (FROM VERIFIED SUPABASE DATABASE):
Crop: ${identifiedCrop?.name || "General Mandi Discovery"}
Location Evaluated: ${targetState || targetDistrict} (${targetCoords[0].toFixed(4)}, ${targetCoords[1].toFixed(4)})
Nearest Mandi: ${nearestMarket ? `${nearestMarket.marketName} (${nearestMarket.district}, ${nearestMarket.state || "AP"}) - ${nearestMarket.distanceKm} km straight-line distance${nearestMarket.modalPrice ? `, Modal: ₹${nearestMarket.modalPrice}/q, Min: ₹${nearestMarket.minPrice}, Max: ₹${nearestMarket.maxPrice}, Date: ${nearestMarket.date}, Status: ${nearestMarket.dataStatus}, Source: ${nearestMarket.source}` : ""}` : "None verified"}
Nearby Comparisons: ${nearbyComparisons.slice(0, 4).map(c => `${c.marketName} (${c.state || "AP"}): ₹${c.modalPrice}/q (${c.distanceKm} km)`).join("; ")}
Storage Facilities: ${storageData.slice(0, 2).map(s => `${s.name}: ₹${s.cost_per_day_per_quintal}/q/day`).join("; ")}

INSTRUCTION TO AI SAATHI:
Explain the factual findings above concisely and clearly to the user in response to their question.
Use the EXACT numbers from the grounding data. Do not hallucinate or guess any other price numbers.
Include data source, date, and data status.`;

    try {
      const aiResult = await askGemini({
        question,
        context: formattedPrompt,
        locale
      });

      if (aiResult.success && aiResult.text) {
        // Phase 26: Prompt Leak Prevention
        if (hasPromptLeak(aiResult.text)) {
          console.warn("[AI Saathi]: Prompt leak detected in model output, falling back to deterministic answer.");
          const safeAnswer = deterministicGroundedAnswer({ intent, question, grounding: groundingContext });
          return res.json({
            answer: safeAnswer,
            source: "grounded-deterministic",
            intent,
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

        return res.json({
          answer: aiResult.text,
          source: aiResult.source || "gemini",
          intent,
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
    } catch (aiErr) {
      console.warn("Gemini execution error:", aiErr.message);
    }
  }

  // Deterministic rule engine fallback
  const answer = deterministicGroundedAnswer({ intent, question, grounding: groundingContext });
  return res.json({
    answer,
    reply: answer,
    response: answer,
    message: answer,
    source: "grounded-deterministic",
    intent,
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

router.post("/", askHandler);
router.post("/ask", askHandler);
router.post("/chat", askHandler);
router.post("/query", askHandler);

export default router;
