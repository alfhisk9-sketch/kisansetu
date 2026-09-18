/**
 * KisanSetu AI Saathi — Centralized Server-Side Gemini Service
 * 
 * Strict Security: GEMINI_API_KEY is server-side only. Never sent to client.
 * Grounding: Fed with real platform context (crops, markets, prices, user lots).
 * Honesty: Explicitly instructed never to hallucinate or invent prices.
 */

const GEMINI_SYSTEM_INSTRUCTION = `You are KisanSetu AI Saathi (किसानसेतु एआई साथी), a trusted, professional agricultural market intelligence assistant for Indian farmers, FPOs, and traders.

GUIDELINES:
1. Grounding: Use ONLY the provided KisanSetu platform data (mandi prices, distances, transportation costs, quality grades, storage facilities) as your source of truth for numbers.
2. Anti-Hallucination: Never invent or extrapolate mandi prices, buyer names, payment guarantees, or government subsidies that are not in the context.
3. If data is missing or unverified, state clearly: "I don't have verified live price data for this market right now."
4. Financial honesty: Present net realization calculations clearly (Sale Value - Transport Cost - Storage). Always note that market prices fluctuate and represent estimates based on mandi arrivals, not guaranteed returns.
5. Tone: Respectful, clear, practical, and farmer-friendly. Avoid overly dense jargon.
6. Language: If the user communicates in Hindi, Marathi, Telugu, or English, respond respectfully in that same language.
7. Brevity: Keep responses structured with concise bullet points or short paragraphs suitable for mobile screens.`;

/**
 * Format platform context for grounding the prompt
 */
export function buildGroundingContext({ user, crop, lots, markets, prices, topOption, storages, locale = "en" }) {
  const parts = [];
  
  if (user) {
    parts.push(`User Profile: ${user.display_name} (${user.role}), Location: ${user.location || "Andhra Pradesh / Telangana"}`);
  }
  
  if (crop) {
    parts.push(`Selected Crop: ${crop.name} (${crop.category || "Produce"}, Unit: ${crop.unit || "quintal"})`);
  }

  if (topOption) {
    parts.push(`Recommended Market Option (from verified APMC Mandis):
- Market: ${topOption.marketName} (${topOption.district})
- Current Modal Price: ₹${topOption.modalPrice}/quintal (Min: ₹${topOption.minPrice || "N/A"}, Max: ₹${topOption.maxPrice || "N/A"})
- Mandi Coordinates: ${topOption.latitude ? `${topOption.latitude}, ${topOption.longitude}` : "Verified APMC Yard"}
- Distance: Approx. ${topOption.distanceKm} km (Haversine/Road estimate)
- Transport Cost: ₹${topOption.transportCostPerQuintal}/quintal
- Estimated Net Realization: ₹${topOption.netRealization}/quintal
- Key Factors: ${topOption.reasons?.join("; ") || "Favorable distance and net price"}
- Provenance: Government of India / AGMARKNET / data.gov.in`);
  }

  if (prices && prices.length > 0) {
    const recentPrices = prices.slice(0, 5).map(p => 
      `${p.market_name || "Mandi"} (${p.market_district || ""}): ₹${p.modal_price}/q [Min: ₹${p.min_price || p.modal_price}, Max: ₹${p.max_price || p.modal_price}] on ${p.date} (Source: ${p.source || "AGMARKNET"})`
    ).join("\n  • ");
    parts.push(`Recent Mandi Prices on Platform:\n  • ${recentPrices}`);
  }

  if (storages && storages.length > 0) {
    const storageList = storages.slice(0, 3).map(s => 
      `${s.name} (${s.district}, ${s.type || "Warehouse"}): ₹${s.cost_per_day_per_quintal}/q/day, Available: ${s.available_capacity_quintals}q, Contact: ${s.contact || "Desk"}`
    ).join("\n  • ");
    parts.push(`Verified Regional Storage Facilities:\n  • ${storageList}`);
  }

  if (lots && lots.length > 0) {
    const userLots = lots.slice(0, 3).map(l => `Lot #${l.id.slice(-5)}: ${l.crop_name} ${l.quantity_quintals}q (${l.grade || "Ungraded"}, Status: ${l.status})`).join(", ");
    parts.push(`User Active Lots: ${userLots}`);
  }

  parts.push(`User Preferred Locale: ${locale}`);
  return parts.join("\n");
}

/**
 * Call Google Gemini 1.5 Flash API
 */
export async function askGemini({ question, context = "", locale = "en" }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      source: "no-key",
      message: "Gemini API key is not configured in server environment."
    };
  }

  const promptText = `CONTEXT FROM KISANSETU PLATFORM:
${context || "No specific lot or market currently selected."}

FARMER / USER QUESTION:
${question}

Provide a helpful, grounded response following the system instructions.`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  let lastError = null;

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: promptText }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 500,
              topP: 0.8
            }
          })
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return {
            success: true,
            text: candidateText.trim(),
            source: model
          };
        }
      } else {
        const errText = await response.text();
        console.warn(`Gemini model ${model} returned HTTP ${response.status}:`, errText.substring(0, 100));
        lastError = `HTTP ${response.status}`;
        // If 503 or 429, loop continues to try next fallback model
        if (response.status !== 503 && response.status !== 429 && response.status !== 404) {
          break;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err.message;
      if (err.name === "AbortError") {
        console.warn(`Gemini model ${model} timed out after 10s.`);
      }
    }
  }

  return {
    success: false,
    source: "api-error",
    message: lastError || "All Gemini models unavailable"
  };
}
