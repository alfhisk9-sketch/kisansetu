import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { runForecast } from "../lib/forecast.js";

const router = Router();

const insForecastRun = db.prepare(
  `INSERT INTO forecast_runs (id, crop_id, market_id, horizon_days, method, predicted_price, mae, rmse, r2, trained_on_rows)
   VALUES (?,?,?,?,?,?,?,?,?,?)`
);

/**
 * MODULE (new, M5): Price Forecast
 * GET /api/forecast?cropId=&marketId=&horizonDays=
 * See PROJECT_CONTRACT.md §4 for the exact response shape and
 * docs/MODEL_CARD.md for methodology, real seeded row counts, and
 * honest limitations. No AI call happens here — server/lib/forecast.js
 * is a pure deterministic ridge-regression baseline over historical
 * market_prices rows.
 */
router.get("/", (req, res) => {
  const { cropId, marketId, horizonDays } = req.query;
  if (!cropId || !marketId || !horizonDays) {
    return res.status(400).json({ error: "cropId, marketId and horizonDays are required" });
  }
  const horizon = Number(horizonDays);
  if (!Number.isInteger(horizon) || horizon <= 0) {
    return res.status(400).json({ error: "horizonDays must be a positive integer" });
  }

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

  if (result.insufficientData) {
    insForecastRun.run(nanoid(10), cropId, marketId, horizon, "insufficient-data", null, null, null, null, result.trainedOnRows);
    return res.status(200).json({
      error: "insufficient historical data for this crop/market",
      trainedOnRows: result.trainedOnRows,
    });
  }

  insForecastRun.run(
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
