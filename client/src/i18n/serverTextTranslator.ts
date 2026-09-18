// server/routes/markets.js and server/routes/assistant.js generate a small
// number of English sentences server-side (recommendation "reasons", and the
// assistant's rule-based answers/notes). Those files are outside i18n
// ownership (server/ is never touched by this module — see
// PROJECT_CONTRACT.md). Both sources only ever produce sentences drawn from a
// small, fixed set of templates with a few numeric/text values inserted, so
// this file recognizes those exact templates and re-renders them through the
// i18n dictionary, preserving every server-computed value untouched.
//
// If the server ever emits something that doesn't match a known template
// (including anything from the live LLM path in assistant.js, which is
// inherently open-ended and can't be pattern-matched), the original English
// text is shown as-is rather than breaking or hiding it. This is a
// deliberate, documented limitation — see the final verification report.

type T = (key: string, vars?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// "reasons" sentences (server/routes/markets.js, /markets/compare endpoint)
// Used by both MarketComparison.tsx and MarketIntelligence.tsx.
// ---------------------------------------------------------------------------

const REASON_PATTERNS: Array<{
  re: RegExp;
  key: string;
  vars: (m: RegExpMatchArray) => Record<string, string | number>;
}> = [
  {
    re: /^Highest net realization in this comparison \(₹([\d.,-]+)\/q\)$/,
    key: "compare.reason.highestNet",
    vars: (m) => ({ price: m[1] }),
  },
  {
    re: /^Net realization is ₹([\d.,-]+)\/q lower than the best option$/,
    key: "compare.reason.netLower",
    vars: (m) => ({ diff: m[1] }),
  },
  {
    re: /^Very low transport distance$/,
    key: "compare.reason.lowDistance",
    vars: () => ({}),
  },
  {
    re: /^Longest transport distance in this comparison — raises cost$/,
    key: "compare.reason.longDistance",
    vars: () => ({}),
  },
  {
    re: /^Recent 7-day price trend is positive \(\+([\d.,-]+)%\)$/,
    key: "compare.reason.trendPositive",
    vars: (m) => ({ pct: m[1] }),
  },
  {
    re: /^Recent 7-day price trend is negative \(([\d.,-]+)%\)$/,
    key: "compare.reason.trendNegative",
    vars: (m) => ({ pct: m[1] }),
  },
  {
    re: /^Strong current buyer demand for this crop$/,
    key: "compare.reason.strongDemand",
    vars: () => ({}),
  },
];

/** Translate one server-generated "reason" sentence, or return it unchanged if unrecognized. */
export function translateReason(t: T, reason: string): string {
  for (const p of REASON_PATTERNS) {
    const m = reason.match(p.re);
    if (m) return t(p.key, p.vars(m));
  }
  return reason;
}

/** Translate a list of reasons, preserving order. */
export function translateReasons(t: T, reasons: string[]): string[] {
  return reasons.map((r) => translateReason(t, r));
}

// ---------------------------------------------------------------------------
// Assistant answers/notes (server/routes/assistant.js)
// Only the deterministic rule-based path (source === "rule-based-fallback")
// is a closed, translatable set. The live LLM path (source === "llm") is
// open-ended model output and is intentionally left untranslated.
// ---------------------------------------------------------------------------

const ANSWER_PATTERNS: Array<{
  re: RegExp;
  key: string;
  vars: (m: RegExpMatchArray) => Record<string, string | number>;
}> = [
  {
    re: /^Grade A means the crop met the platform's quality checklist:.*Quality Grading\.$/,
    key: "assistant.rb.gradeA",
    vars: () => ({}),
  },
  {
    re: /^Transport cost is subtracted per quintal from the selling price.*higher headline price\.$/,
    key: "assistant.rb.transportEarn",
    vars: () => ({}),
  },
  {
    re: /^Open Market Intelligence and enter your crop, quantity and location.*not just headline price\.$/,
    key: "assistant.rb.recommendNoContext",
    vars: () => ({}),
  },
  {
    re: /^Based on current data, (.+?) shows the strongest recommendation score \((\d+)\/100\) for your crop: (.+?)\. Open Market Comparison to see the full breakdown and all other options\.$/,
    key: "assistant.rb.recommendWithContext",
    vars: (m) => ({ market: m[1], score: m[2], reasons: m[3] }),
  },
  {
    re: /^Recommendations are based on net realization, transport distance, recent price trend, and current buyer demand.*Market Comparison screen\.$/,
    key: "assistant.rb.whyRecommendedNoContext",
    vars: () => ({}),
  },
  {
    re: /^(.+?) is recommended because: (.+?)\.$/,
    key: "assistant.rb.whyRecommendedWithContext",
    vars: (m) => ({ market: m[1], reasons: m[2] }),
  },
  {
    re: /^The Price Forecast page runs a real ridge-regression baseline.*run it for your crop and market to see the real figures\.$/,
    key: "assistant.rb.forecastAccuracy",
    vars: () => ({}),
  },
  {
    re: /^I can help explain net realization, quality grades, market comparisons, and buyer matches.*do not depend on this assistant\.$/,
    key: "assistant.rb.generic",
    vars: () => ({}),
  },
];

const NOTE_PATTERNS: Array<{ re: RegExp; key: string }> = [
  {
    re: /^AI API not configured for this deployment.*works fully without this\.$/,
    key: "assistant.rb.noteNoApiKey",
  },
  {
    re: /^Assistant temporarily unavailable.*rule templates instead\.$/,
    key: "assistant.rb.noteTempUnavailable",
  },
];

/**
 * Translate an assistant response. Only attempts translation when the server
 * marked the response as the deterministic rule-based path — a live LLM
 * answer (source === "llm") is free-form model output and is returned as-is.
 * Any rule-based text that doesn't match a known template (e.g. the server
 * template wording changes later) also falls back to the original text
 * rather than breaking.
 */
export function translateAssistantAnswer(t: T, answer: string, source?: string): string {
  if (source !== "rule-based-fallback") return answer;
  for (const p of ANSWER_PATTERNS) {
    const m = answer.match(p.re);
    if (m) {
      const vars = p.vars(m);
      // The two context-aware templates embed a semicolon-joined "reasons"
      // list, which is itself made of translatable reason sentences.
      if (typeof vars.reasons === "string") {
        vars.reasons = translateReasons(t, vars.reasons.split("; ")).join("; ");
      }
      return t(p.key, vars);
    }
  }
  return answer;
}

export function translateAssistantNote(t: T, note?: string, source?: string): string | undefined {
  if (!note) return note;
  if (source !== "rule-based-fallback") return note;
  for (const p of NOTE_PATTERNS) {
    if (p.re.test(note)) return t(p.key);
  }
  return note;
}
