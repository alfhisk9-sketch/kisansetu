// ============================================================
// KrishiSetu Market — Price Forecast Baseline (M5)
// Pure functions only, like algorithms.js: no DB access, no AI/LLM
// calls, no side effects. server/routes/forecast.js is the only
// caller and owns all persistence.
//
// WHY THIS MODEL, NOT SOMETHING FANCIER:
// Each (crop, market) pair in the seeded dataset has exactly 30 daily
// market_prices rows (see docs/MODEL_CARD.md for the row-count table).
// After building lag features and shifting by the requested horizon,
// the number of usable (features, target) training examples is even
// smaller — often well under 20. A Random Forest / XGBoost / neural
// model on that many points would overfit immediately and produce a
// metric that looks precise but means nothing (contract §8: never
// dress up a number beyond what the data supports). A small ridge
// regression on a handful of lagged-price features is the most
// complex model this dataset can honestly support.
//
// WHY RIDGE (NOT PLAIN OLS):
// One of the four features (a 3-day moving average) is, by
// construction, the arithmetic mean of the other three (the 3 lags).
// That makes the design matrix exactly rank-deficient, so plain
// least squares (X^T X)^-1 has no unique solution. A small L2 penalty
// (ridge) makes the system solvable without dropping a feature that's
// still useful signal on its own. This is a numerical-stability
// choice, not a "more advanced model" claim.
// ============================================================

// ---- Documented thresholds (tune here, not inline) ----
export const MIN_HISTORICAL_ROWS = 15; // raw market_prices rows required for this crop/market pair before we even try
export const LAG_COUNT = 3; // t-1, t-2, t-3
export const MA_WINDOW = 3; // moving average computed over the same 3 lags
export const MIN_TRAIN_SAMPLES = 7; // chronological training examples required
export const MIN_TEST_SAMPLES = 3; // chronological held-out examples required for a meaningful metric
export const MIN_TRAINING_SAMPLES = MIN_TRAIN_SAMPLES + MIN_TEST_SAMPLES; // 10: total usable (features,target) rows required
export const RIDGE_LAMBDA = 1.0; // L2 penalty applied to STANDARDIZED features (see fitRidgeRegression)
export const METHOD_NAME = "ridge-regression-lagged-prices";

/**
 * Turn a chronologically-ascending price series into supervised
 * (features, target) rows for a given prediction horizon.
 *
 * series: [{ date, modal_price }] ascending by date (caller must sort ASC).
 * horizonDays: predict modal_price at index i+horizonDays from features built at index i.
 *
 * Feature vector per row: [lag1, lag2, lag3, movingAvg3] where
 *   lag1 = price at i-1, lag2 = price at i-2, lag3 = price at i-3
 *   movingAvg3 = mean(lag1, lag2, lag3)
 * Target: price at i+horizonDays
 *
 * Returns { samples: [{ features:number[4], target:number, targetDate:string }], usableCount:number }
 */
export function buildFeatureRows(series, horizonDays) {
  const samples = [];
  if (!Array.isArray(series) || horizonDays == null || horizonDays <= 0) {
    return { samples, usableCount: 0 };
  }
  const n = series.length;
  for (let i = LAG_COUNT; i + horizonDays <= n - 1; i++) {
    const lag1 = series[i - 1].modal_price;
    const lag2 = series[i - 2].modal_price;
    const lag3 = series[i - 3].modal_price;
    const ma3 = (lag1 + lag2 + lag3) / MA_WINDOW;
    const targetRow = series[i + horizonDays];
    samples.push({ features: [lag1, lag2, lag3, ma3], target: targetRow.modal_price, targetDate: targetRow.date });
  }
  return { samples, usableCount: samples.length };
}

/**
 * Chronological (never random-shuffle) train/test split: earliest
 * samples train, latest samples test. A random split would leak
 * future information into training on a time series.
 */
export function chronologicalSplit(samples) {
  const total = samples.length;
  const testCount = Math.max(MIN_TEST_SAMPLES, Math.round(total * 0.2));
  const trainCount = total - testCount;
  return {
    train: samples.slice(0, trainCount),
    test: samples.slice(trainCount),
    trainCount,
    testCount,
  };
}

// ---- Small linear-algebra helpers (closed-form ridge regression) ----

function standardize(rows) {
  const k = rows[0].length;
  const mean = new Array(k).fill(0);
  const std = new Array(k).fill(0);
  for (const row of rows) for (let j = 0; j < k; j++) mean[j] += row[j];
  for (let j = 0; j < k; j++) mean[j] /= rows.length;
  for (const row of rows) for (let j = 0; j < k; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < k; j++) {
    std[j] = Math.sqrt(std[j] / rows.length);
    if (std[j] === 0) std[j] = 1; // constant column — avoid divide-by-zero, contributes nothing
  }
  const scaled = rows.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { scaled, mean, std };
}

function applyStandardize(row, mean, std) {
  return row.map((v, j) => (v - mean[j]) / std[j]);
}

// Gaussian elimination with partial pivoting for a small dense system Ax = b.
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pivotVal = M[col][col] || 1e-9;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / pivotVal;
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-9));
}

/**
 * Closed-form ridge regression: beta = (X^T X + lambda*I)^-1 X^T y,
 * fit on features standardized to zero mean / unit variance so the
 * single fixed lambda regularizes every feature comparably (raw
 * prices are in the thousands; an unstandardized ridge penalty would
 * do almost nothing). The intercept is not standardized/penalized.
 */
export function fitRidgeRegression(featureRows, targets, lambda = RIDGE_LAMBDA) {
  const { scaled, mean, std } = standardize(featureRows);
  const k = scaled[0].length;
  const withBias = scaled.map((row) => [...row, 1]); // bias column, unregularized
  const dim = k + 1;

  const XtX = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const Xty = new Array(dim).fill(0);
  for (let r = 0; r < withBias.length; r++) {
    for (let a = 0; a < dim; a++) {
      Xty[a] += withBias[r][a] * targets[r];
      for (let bcol = 0; bcol < dim; bcol++) XtX[a][bcol] += withBias[r][a] * withBias[r][bcol];
    }
  }
  for (let d = 0; d < k; d++) XtX[d][d] += lambda; // penalize feature weights only, not the bias term

  const beta = solveLinearSystem(XtX, Xty);
  return {
    predict(rawFeatureRow) {
      const s = applyStandardize(rawFeatureRow, mean, std);
      let y = beta[k]; // bias
      for (let j = 0; j < k; j++) y += beta[j] * s[j];
      return y;
    },
    coefficients: beta.slice(0, k),
    intercept: beta[k],
    featureMean: mean,
    featureStd: std,
  };
}

export function computeMetrics(yTrue, yPred) {
  const n = yTrue.length;
  const errors = yTrue.map((y, i) => y - yPred[i]);
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const meanY = yTrue.reduce((s, y) => s + y, 0) / n;
  const ssRes = errors.reduce((s, e) => s + e * e, 0);
  const ssTot = yTrue.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;
  return {
    mae: Math.round(mae * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
  };
}

/**
 * Top-level orchestrator used by server/routes/forecast.js.
 *
 * series: [{ date, modal_price }] for one (cropId, marketId) pair, ANY order —
 *         this function sorts it ascending by date itself.
 * horizonDays: integer > 0.
 *
 * Returns either:
 *   { insufficientData: true, trainedOnRows }
 * or:
 *   { insufficientData: false, predictedPrice, mae, rmse, r2, trainedOnRows, method, note }
 */
export function runForecast(series, horizonDays) {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rawHistoricalRows = sorted.length;

  if (rawHistoricalRows < MIN_HISTORICAL_ROWS) {
    return { insufficientData: true, trainedOnRows: rawHistoricalRows };
  }

  const { samples, usableCount } = buildFeatureRows(sorted, horizonDays);
  if (usableCount < MIN_TRAINING_SAMPLES) {
    return { insufficientData: true, trainedOnRows: Math.max(0, usableCount) };
  }

  // 1) Honest evaluation: fit on the chronological TRAIN split only, score on TEST.
  const { train, test } = chronologicalSplit(samples);
  const evalModel = fitRidgeRegression(train.map((s) => s.features), train.map((s) => s.target));
  const testPreds = test.map((s) => evalModel.predict(s.features));
  const metrics = computeMetrics(test.map((s) => s.target), testPreds);

  // 2) Final model for the live prediction: refit on ALL usable samples
  //    (train+test combined) to use every available data point for the
  //    number a user actually sees. Reported metrics above still come
  //    only from the held-out split, never from data the final fit saw.
  const finalModel = fitRidgeRegression(samples.map((s) => s.features), samples.map((s) => s.target));
  const last = sorted[sorted.length - 1];
  const prev1 = sorted[sorted.length - 2].modal_price;
  const prev2 = sorted[sorted.length - 3].modal_price;
  const prev3 = sorted[sorted.length - 4].modal_price;
  const liveFeatures = [last.modal_price, prev1, prev2, (last.modal_price + prev1 + prev2) / MA_WINDOW];
  // NOTE: "current day" for the live prediction is the most recent seeded date (last.date),
  // so lag1 = last.modal_price itself, lag2/lag3 = the two days before it.
  const predictedPriceRaw = finalModel.predict(liveFeatures);

  return {
    insufficientData: false,
    predictedPrice: Math.round(predictedPriceRaw * 10) / 10,
    mae: metrics.mae,
    rmse: metrics.rmse,
    r2: metrics.r2,
    trainedOnRows: usableCount,
    method: METHOD_NAME,
    note: `Trained on ${usableCount} demo-seeded historical price rows (chronological train=${train.length}/test=${test.length} split, ${horizonDays}-day horizon); a small-sample baseline, not a production forecast.`,
  };
}
