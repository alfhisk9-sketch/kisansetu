# MODEL_CARD.md — KisanSetu Price Forecast Baseline (M5)

Owner: ML forecast baseline (feature/ml-forecast). Backs `GET /api/forecast`
per `PROJECT_CONTRACT.md` §4. Read this before quoting any number from
this feature on a slide — every figure below is either an exact fact
read from the code, or clearly labeled as a local, non-live simulation
(see "What could not be executed" at the end).

---

## 1. What this is / is not

- A small closed-form **ridge regression** over lagged daily prices —
  a statistics baseline, not a production forecasting system.
- Trained fresh **on every request** directly from `market_prices`, then
  logged to `forecast_runs` for auditability. Nothing is hardcoded.
- Deliberately *not* a Random Forest / XGBoost / neural model. See §4.

## 2. Data source and exact row counts

Source: `market_prices` table, populated by `server/seed.js`.

**⚠️ How these counts were determined:** this sandbox has no outbound
network access (`npm install` fails with `403 Forbidden` against
`registry.npmjs.org`, same failure QA hit — see `BUG_LIST.md`), so
`better-sqlite3` could not be installed and the seed script could not
be run against a real database here. The counts below are **not**
measured from a live DB query. They are derived by reading
`server/seed.js`'s price-generation loop (lines building
`marketCropMap` / `basePriceByCrop` / the `for (dayOffset = 29; ...)`
loop) and are exact — that loop has no data-dependent branching or
early exits, so every `(market, crop)` pair present in
`marketCropMap` receives precisely 30 rows regardless of the RNG seed.
I additionally re-implemented that loop verbatim in an isolated script
and ran it (see §7) to confirm the count mechanically rather than by
eyeballing the code.

- **26 distinct (crop, market) pairs** are seeded.
- **Every pair has exactly 30 rows** — one per calendar day.
- **780 total rows** in `market_prices` after a fresh seed.
- **Date range:** the 30 consecutive calendar days ending on whatever
  date `npm run seed` is executed (the loop uses `new Date()` at seed
  time, counting `dayOffset` from 29 down to 0). It is **not** a fixed
  historical range — reseeding on a different day shifts the window.
- No pair has missing/gap days within its 30-day window (the loop
  always executes for every `dayOffset` in range).

Full pair list (crop, market — 30 rows each):

| Market | Crops traded there |
|---|---|
| Lasalgaon APMC | Onion, Wheat |
| Pimpalgaon Baswant APMC | Onion, Grapes |
| Manmad APMC | Onion, Maize |
| Pune (Market Yard) APMC | Tomato, Onion, Grapes |
| Solapur APMC | Pomegranate, Cotton, Soybean |
| Sangli APMC | Grapes, Soybean, Tomato |
| Kolhapur APMC | Soybean, Maize |
| Nagpur APMC (Kalamna) | Cotton, Soybean, Wheat |
| Ahilyanagar APMC | Onion, Pomegranate, Cotton |
| Chhatrapati Sambhajinagar APMC | Cotton, Maize, Soybean |

Per-crop market coverage: Onion 5 markets, Soybean 5, Cotton 4,
Grapes 3, Maize 3, Wheat 2, Tomato 2, Pomegranate 2.

## 3. Sufficiency at 30 rows/pair — the number that drove every design choice below

30 raw rows per pair is small for *any* supervised model, and shrinks
further once turned into a supervised (features → target) dataset:
lagging by 3 days and shifting by the forecast horizon consumes rows
from both ends. At `horizonDays=14` a 30-row series yields only
**13** usable training examples; at `horizonDays=90` it yields **0**
(90 days ahead simply cannot be validated against a 30-day series).
This directly motivated:
- a linear/ridge model instead of anything higher-capacity (§4),
- an explicit, honestly-defined "insufficient data" threshold instead
  of forcing a number out of too little data (§5),
- reporting `trainedOnRows` in every response so nobody mistakes a
  13-sample fit for a robust one.

## 4. Model

**File:** `server/lib/forecast.js` — pure functions, no DB access, no
AI/LLM calls, matching the existing `lib/algorithms.js` pattern.

- **Features (4):** `lag1`, `lag2`, `lag3` (modal price at t-1, t-2,
  t-3) and `ma3` (their 3-day mean).
- **Target:** modal price at `t + horizonDays`.
- **Method:** closed-form **ridge regression**
  (`beta = (XᵀX + λI)⁻¹ Xᵀy`, `λ = 1.0`) on features standardized to
  zero mean / unit variance before fitting.
- **Why ridge, not plain OLS:** `ma3` is *exactly* the mean of the
  other three features by construction, so the design matrix is
  rank-deficient — plain least squares has no unique solution. The L2
  penalty makes the system solvable without dropping a feature that's
  still independently useful (recent-trend vs. single-day noise).
  This is a numerical-stability choice, not a "fancier model" claim.
- **Why not Random Forest / XGBoost / a neural net:** with 13–20
  usable training rows in the typical case (§3), a high-capacity model
  memorizes the training set and produces a test metric that is
  precise-looking but meaningless — exactly the "unreportable metric"
  the task brief warned against. A 4-feature linear model is close to
  the most complex model this dataset can honestly support.
- **Train/test split:** strictly **chronological** — earliest samples
  train, latest test, never a random shuffle (a random split on a time
  series leaks future information into training).
- **Final prediction:** the reported `mae`/`rmse`/`r2` come from a
  model fit **only** on the chronological training slice and scored on
  the untouched test slice. The `predictedPrice` actually returned to
  the caller comes from a **second fit on all usable rows** (train+test
  combined) applied to the most recent 3 real days on record — this
  uses all available signal for the number a user sees, while the
  reported metrics never include data the deployed fit was trained on.

## 5. Insufficient-data policy (exact thresholds, defined in `forecast.js`)

| Constant | Value | Meaning |
|---|---|---|
| `MIN_HISTORICAL_ROWS` | 15 | Raw `market_prices` rows required for the pair before attempting anything |
| `LAG_COUNT` | 3 | Days of lag history each feature row needs |
| `MIN_TRAIN_SAMPLES` | 7 | Chronological training examples required |
| `MIN_TEST_SAMPLES` | 3 | Chronological held-out examples required |
| `MIN_TRAINING_SAMPLES` | 10 (7+3) | Total usable (features, target) rows required |

If raw rows < 15, or usable engineered samples < 10 (this is what
catches large horizons against a short series, e.g. `horizonDays=90`
against 30 rows of history), the endpoint returns the contract's
insufficient-data shape — **200 status**, `{ "error": "...",
"trainedOnRows": N }` — rather than fabricating a number. `N` is the
usable-sample count that was actually available (clamped to 0), so the
response itself explains why it was insufficient.

## 6. Metrics methodology

- **MAE / RMSE**: standard mean absolute / root-mean-square error in
  ₹/quintal, computed on the chronological test slice only.
- **R²**: `1 - SS_res/SS_tot` on the same test slice.

**Honest caveat — please read before quoting R² on a slide:** the
contractual minimum test-set size here is only **3 points**
(`MIN_TEST_SAMPLES`). R² is a variance-explained ratio and is
statistically unstable at n=3 — a couple of ₹20–50 misses on a
tightly-clustered 3-point test set can produce a *very* negative R²
(seen routinely in §7 below, e.g. -36, -68) even when MAE/RMSE look
reasonable in absolute ₹ terms. A negative R² here means "worse than
predicting the test-set mean on 3 points," which is expected behavior
for a linear baseline evaluated on this little held-out data — it is
**not** evidence the model is unusably bad, but it is also not a
number that should be presented alongside a false sense of precision.
Recommend M4 pair any R² figure on a slide with the `trainedOnRows`
and test-set-size context, or lead with MAE/RMSE instead.

## 7. Example results (locally simulated — not from a live server)

Because a live server could not be run here (§9), these numbers come
from executing the **actual, final `server/lib/forecast.js` code** (no
edits, same file that ships) against a **local, line-for-line
reproduction of `seed.js`'s deterministic price-generation formula**
(same `mulberry32(42)` RNG, same loop). This confirms the code runs
without errors end-to-end and produces sane outputs — but the exact
price figures below will differ slightly from a real `npm run seed`
run on a different calendar day (the seed's `today` shifts the trend
starting point; row counts and thresholds do not change).

| Pair | horizonDays | trainedOnRows | predictedPrice | MAE | RMSE | R² |
|---|---|---|---|---|---|---|
| Onion / Lasalgaon | 14 | 13 | 2943.2 | 50.79 | 52.29 | -36.98 |
| Wheat / Nagpur | 90 | 0 (insufficient data) | — | — | — | — |
| Onion / Lasalgaon | 7 | 20 | 2543.8 | 92.64 | 93.67 | -36.47 |
| Wheat / Lasalgaon | 7 | 20 | 2419.6 | 5.33 | 8.15 | 0.41 |
| Soybean / Aurangabad | 7 | 20 | 4409.6 | 2.82 | 3.48 | 0.88 |
| Pomegranate / Ahilyanagar | 7 | 20 | 8708.6 | 34.68 | 36.61 | 0.13 |

The full 26-pair × horizonDays=7 sweep was run locally; results range
from R² ≈ 0.88 (soybean/Aurangabad) down to R² ≈ -92 (grapes/Pune) —
consistent with §6's caveat that R² on tiny test sets swings hard
based on how much the 3 held-out days happened to move.

## 8. Limitations (per contract §8 — data honesty)

- **Small dataset:** 30 rows/pair is a demo-sized window, not enough
  for a model that generalizes confidently, especially at longer
  horizons.
- **Seeded, not real-world:** prices are a deterministic pseudo-random
  walk from a fixed base price, not real APMC arrivals — good for
  demonstrating the pipeline, not for real trading decisions.
- **Short, fixed-length window:** exactly 30 consecutive days, no
  multi-season or multi-year signal, so no real seasonality is
  learnable.
- **R² instability at small n** — see §6.
- **No exogenous features** (weather, festivals, fuel cost, regional
  arrivals elsewhere) — only the crop's own lagged price history.
- **Every request retrains from scratch** — deterministic given fixed
  seed data, but means a burst of forecast requests writes a matching
  burst of `forecast_runs` audit rows; no caching layer.
- **Full response shape and honesty language already matches contract
  §4/§8** (`note` field states this is a small-sample baseline, not a
  production forecast, on every successful response).

## 9. What could not be executed in this environment

- `npm install` in `server/` fails with `403 Forbidden` against
  `registry.npmjs.org` (same failure BUG_LIST.md's QA pass hit) — no
  outbound network access in this sandbox.
- Because of that, `better-sqlite3` (and every other server
  dependency) could not be installed, so `server/index.js` could not
  actually be booted and `GET /api/forecast` was **not** hit over real
  HTTP against a live SQLite database in this session.
- What **was** verified by direct execution: `server/lib/forecast.js`
  (the exact file being shipped) was imported and run, unmodified,
  against realistic input series (§7), including the two scenarios the
  Postman collection already encodes (`crop-onion`/`mkt-lasalgaon`/
  `horizonDays=14` → real numbers; `crop-wheat`/`mkt-nagpur`/
  `horizonDays=90` → insufficient-data with `trainedOnRows: 0`), plus
  edge cases (empty series, below-threshold row counts, exact
  threshold boundaries) — all ran without errors and returned the
  shapes described above.
- `server/routes/forecast.js` and the `index.js` mount were written to
  match the existing route files' style exactly (validated by reading
  every other route file) and reviewed by hand line-by-line against
  `PROJECT_CONTRACT.md` §4, but the route itself could not be
  round-tripped over real HTTP for the reason above.
- **Recommendation:** once a reachable environment exists, run the two
  Postman cases in `docs/postman_collection.json` (already primed for
  exactly this endpoint) plus a few more horizon/pair combinations, and
  replace the "locally simulated" numbers in §7 with real ones.
