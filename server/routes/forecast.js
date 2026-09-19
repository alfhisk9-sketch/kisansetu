import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { runForecast } from "../lib/forecast.js";

const router = Router();

// Lazy local SQLite statement initialization so module import never crashes on startup
let _localInsForecastRun = null;
function getLocalInsForecastRun() {
  if (!_localInsForecastRun) {
    _localInsForecastRun = db.prepare(
      `INSERT INTO forecast_runs (id, crop_id, market_id, horizon_days, method, predicted_price, mae, rmse, r2, trained_on_rows)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
  }
  return _localInsForecastRun;
}

/**
 * MODULE (M5): Price Forecast
 * GET /api/forecast?cropId=&marketId=&horizonDays=
 * See PROJECT_CONTRACT.md §4 for the exact response shape and
 * docs/MODEL_CARD.md for methodology.
 * In production mode, uses Supabase PostgreSQL as the authoritative source.
 * In local/offline mode, falls back to SQLite.
 */
router.get("/", async (req, res) => {
  const { cropId, marketId, horizonDays } = req.query;
  if (!cropId || !marketId || !horizonDays) {
    return res.status(400).json({ error: "cropId, marketId and horizonDays are required" });
  }
  const horizon = Number(horizonDays);
  if (!Number.isInteger(horizon) || horizon <= 0) {
    return res.status(400).json({ error: "horizonDays must be a positive integer" });
  }

  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    if (!supabase) {
      return res.status(503).json({ error: "Production Database Unavailable: Supabase client not configured" });
    }
    // --- PRODUCTION MODE: Supabase PostgreSQL ---
    try {
      const { data: cropData } = await supabase.from("crops").select("id").eq("id", cropId).maybeSingle();
      if (!cropData) {
        return res.status(404).json({ error: `unknown cropId: ${cropId}` });
      }

      const { data: marketData } = await supabase.from("markets").select("id").eq("id", marketId).maybeSingle();
      if (!marketData) {
        return res.status(404).json({ error: `unknown marketId: ${marketId}` });
      }

      const { data: priceRows, error: pErr } = await supabase
        .from("market_prices")
        .select("date, modal_price")
        .eq("crop_id", cropId)
        .eq("market_id", marketId)
        .order("date", { ascending: true });

      if (pErr) {
        return res.status(500).json({ error: "Failed to fetch price series from Supabase" });
      }

      const series = (priceRows || []).map(r => ({
        date: r.date,
        modal_price: Number(r.modal_price)
      }));

      const result = runForecast(series, horizon);

      // Asynchronously log the forecast run to Supabase forecast_runs table
      supabase.from("forecast_runs").insert({
        id: `fc-${nanoid(10)}`,
        crop_id: cropId,
        market_id: marketId,
        horizon_days: horizon,
        method: result.method || "insufficient-data",
        predicted_price: result.predictedPrice ?? null,
        mae: result.mae ?? null,
        rmse: result.rmse ?? null,
        r2: result.r2 ?? null,
        trained_on_rows: result.trainedOnRows
      }).then(() => {}).catch(() => {});

      if (result.insufficientData) {
        return res.status(200).json({
          error: "insufficient historical data for this crop/market",
          trainedOnRows: result.trainedOnRows,
        });
      }

      return res.json({
        predictedPrice: result.predictedPrice,
        mae: result.mae,
        rmse: result.rmse,
        r2: result.r2,
        trainedOnRows: result.trainedOnRows,
        method: result.method,
        note: result.note,
      });
    } catch (err) {
      return res.status(500).json({ error: "Production forecast error: " + err.message });
    }
  }

  // --- LOCAL / OFFLINE DEVELOPMENT MODE: SQLite ---
  const cropExists = db.prepare(`SELECT 1 FROM crops WHERE id = ?`).get(cropId);
  if (!cropExists) {
    return res.status(404).json({ error: `unknown cropId: ${cropId}` });
  }
  const marketExists = db.prepare(`SELECT 1 FROM markets WHERE id = ?`).get(marketId);
  if (!marketExists) {
    return res.status(404).json({ error: `unknown marketId: ${marketId}` });
  }

  const series = db
    .prepare(`SELECT date, modal_price FROM market_prices WHERE crop_id = ? AND market_id = ? ORDER BY date ASC`)
    .all(cropId, marketId);

  const result = runForecast(series, horizon);

  try {
    const ins = getLocalInsForecastRun();
    if (result.insufficientData) {
      ins.run(nanoid(10), cropId, marketId, horizon, "insufficient-data", null, null, null, null, result.trainedOnRows);
    } else {
      ins.run(
        nanoid(10),
        cropId,
        marketId,
        horizon,
        result.method,
        result.predictedPrice,
        result.mae,
        result.rmse,
        result.r2,
        result.trainedOnRows
      );
    }
  } catch (_) {}

  if (result.insufficientData) {
    return res.status(200).json({
      error: "insufficient historical data for this crop/market",
      trainedOnRows: result.trainedOnRows,
    });
  }

  res.json({
    predictedPrice: result.predictedPrice,
    mae: result.mae,
    rmse: result.rmse,
    r2: result.r2,
    trainedOnRows: result.trainedOnRows,
    method: result.method,
    note: result.note,
  });
});

export default router;
