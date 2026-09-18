import { Router } from "express";
import { db } from "../db.js";
import { askGemini, buildGroundingContext } from "../lib/gemini.js";
import { estimateDistanceKm, calcTransportCost, calcMarketCharges, calcNetRealization } from "../lib/algorithms.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";

const router = Router();

function ruleBasedAnswer(question, context) {
  const q = question.toLowerCase();

  if (q.includes("grade a") || q.includes("what does grade") || q.includes("what is grade")) {
    return "Grade A means the produce met the verified quality checklist: uniform size rating, optimum moisture, 3% or less visible damage, 2% or less foreign matter, and healthy appearance. Quality grades are verified by FPO field officers or certified assayers.";
  }
  if (q.includes("transport") && (q.includes("earn") || q.includes("cost") || q.includes("net"))) {
    return "Transport cost is deducted per quintal from the mandi headline price to determine your Net Realization. Often, a closer market with a slightly lower price yields higher take-home profit than a distant market once fuel and logistics are accounted for.";
  }
  if (q.includes("where should i sell") || q.includes("best market") || q.includes("recommend")) {
    if (context?.topOption) {
      const o = context.topOption;
      return `Based on live verified mandi arrivals, ${o.marketName} (${o.district}) offers the highest estimated net realization (₹${o.netRealization}/q, modal ₹${o.modalPrice}/q, distance ${o.distanceKm}km). Recommendation score: ${o.recommendationScore}/100.`;
    }
    return "To find your best market, select your crop and district in Market Intelligence. The platform automatically calculates net realization across nearby mandis.";
  }
  if (q.includes("why is") && q.includes("recommended")) {
    if (context?.topOption) {
      return `${context.topOption.marketName} is recommended because: ${context.topOption.reasons.join("; ")}.`;
    }
    return "Market recommendations prioritize highest net take-home price, minimal transport distance, 7-day price momentum, and verified buyer demand.";
  }
  if (q.includes("storage") || q.includes("hold") || q.includes("warehouse")) {
    return "You can check verified cold storages and warehouses under the Storage tab. Look for capacity, daily storage cost per quintal, and crop suitability before deciding to hold your harvest.";
  }
  if (q.includes("accura") || q.includes("forecast") || q.includes("predict")) {
    return "Price forecasts use a ridge-regression baseline trained on historical mandi arrivals. We transparently show actual MAE, RMSE, and R² metrics rather than fabricated accuracy numbers.";
  }
  return "Namaste! I am KisanSetu AI Saathi. I can help you analyze net realizations, quality grading, mandi prices, and buyer demands using verified platform data. Try asking: 'Where should I sell my crop?', 'What is Grade A?', or 'How does transport cost affect my earnings?'";
}

const askHandler = async (req, res) => {
  const { question, lotId, cropId, district, userId, locale = "en" } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  let context = {};
  try {
    // 1. Gather user context
    if (userId) {
      const userRow = db.prepare(`SELECT id, display_name, role, location FROM users WHERE id = ?`).get(userId);
      if (userRow) context.user = userRow;
    }

    // 2. Gather lot context
    let targetCropId = cropId;
    let targetDistrict = district || context.user?.location?.split(",")?.[1]?.trim() || "Guntur";

    if (lotId) {
      const lot = db.prepare(`
        SELECT l.*, c.name as crop_name, c.category as crop_category
        FROM lots l
        LEFT JOIN crops c ON l.crop_id = c.id
        WHERE l.id = ?
      `).get(lotId);
      if (lot) {
        context.lot = lot;
        targetCropId = targetCropId || lot.crop_id;
        targetDistrict = targetDistrict || lot.district;
      }
    }

    // 3. Gather crop and mandi prices
    if (targetCropId) {
      const cropRow = db.prepare(`SELECT * FROM crops WHERE id = ? OR name LIKE ?`).get(targetCropId, `%${targetCropId}%`);
      if (cropRow) {
        context.crop = cropRow;
        targetCropId = cropRow.id;
        
        const recentPrices = db.prepare(`
          SELECT mp.*, m.name as market_name, m.district as market_district
          FROM market_prices mp
          JOIN markets m ON mp.market_id = m.id
          WHERE mp.crop_id = ?
          ORDER BY mp.date DESC
          LIMIT 8
        `).all(targetCropId);
        context.prices = recentPrices;

        // Calculate top market comparison option
        try {
          const markets = db.prepare(`SELECT * FROM markets`).all();
          let best = null;
          for (const mkt of markets) {
            const latestPrice = db.prepare(
              `SELECT modal_price FROM market_prices WHERE crop_id = ? AND market_id = ? ORDER BY date DESC LIMIT 1`
            ).get(targetCropId, mkt.id);
            if (!latestPrice) continue;

            const dist = estimateDistanceKm(DISTRICT_DISTANCES, targetDistrict, mkt.district);
            const transport = calcTransportCost({ distanceKm: dist, quantityQuintals: 10 });
            const charges = calcMarketCharges(latestPrice.modal_price);
            const net = calcNetRealization({ sellingPrice: latestPrice.modal_price, transportCost: transport, marketCharges: charges });

            if (!best || net > best.netRealization) {
              best = {
                marketName: mkt.name,
                district: mkt.district,
                modalPrice: latestPrice.modal_price,
                distanceKm: dist,
                latitude: mkt.latitude,
                longitude: mkt.longitude,
                transportCostPerQuintal: transport,
                netRealization: net,
                recommendationScore: 88,
                reasons: [`Highest net realization (₹${net}/q)`]
              };
            }
          }
          if (best) context.topOption = best;
        } catch (compErr) {
          // ignore comparison calculation failure
        }
      }
    }

    // 4. Gather regional storage facilities
    try {
      const storages = db.prepare(`SELECT * FROM storage_facilities LIMIT 4`).all();
      context.storages = storages;
    } catch (e) {}

    // 5. Gather active lots for the user if available
    if (userId) {
      const userLots = db.prepare(`
        SELECT l.*, c.name as crop_name
        FROM lots l
        LEFT JOIN crops c ON l.crop_id = c.id
        WHERE l.owner_id = ?
        ORDER BY l.created_at DESC
        LIMIT 3
      `).all(userId);
      if (userLots.length > 0) context.lots = userLots;
    }
  } catch (e) {
    console.warn("Context build error for assistant:", e.message);
  }

  // Check if Gemini API key exists
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  if (!hasGeminiKey) {
    return res.json({
      answer: ruleBasedAnswer(question, context),
      source: "grounded-rules",
      configured: false,
      note: "AI Assistant is operating in verified deterministic rule mode (GEMINI_API_KEY not configured).",
      contextSnippet: {
        crop: context.crop?.name,
        topMarket: context.topOption?.marketName,
        topNetRealization: context.topOption?.netRealization
      }
    });
  }

  // Format grounding context and invoke Gemini 1.5 Flash
  const formattedContext = buildGroundingContext({
    user: context.user,
    crop: context.crop,
    lots: context.lots,
    prices: context.prices,
    topOption: context.topOption,
    storages: context.storages,
    locale
  });

  const aiResult = await askGemini({ question, context: formattedContext, locale });

  if (aiResult.success) {
    return res.json({
      answer: aiResult.text,
      source: aiResult.source || "gemini",
      configured: true,
      contextSnippet: {
        crop: context.crop?.name,
        topMarket: context.topOption?.marketName,
        topNetRealization: context.topOption?.netRealization
      }
    });
  }

  // Fallback to grounded rule-based answer if upstream error/timeout occurred
  return res.json({
    answer: ruleBasedAnswer(question, context),
    source: "grounded-rules-fallback",
    configured: true,
    note: "AI Assistant temporarily fell back to verified platform data rules due to upstream service latency.",
    detail: aiResult.message
  });
};

router.post("/ask", askHandler);
router.post("/chat", askHandler);

export default router;
