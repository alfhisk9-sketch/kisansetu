# PROJECT_CONTRACT.md — KisanSetu

Every Claude session (M1–M6) must be given this file before doing any work.
This is the single source of truth for names, shapes, and rules. If your task
seems to require deviating from this contract, stop and flag it to M1
(integration lead) rather than improvising — an improvised shape is exactly
what causes merge conflicts on day 2.

## 1. Tech stack (locked — do not swap any of these)

- **Backend:** Node.js 18+, Express 4, better-sqlite3, ESM modules (`"type": "module"`)
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, react-router-dom v6, Recharts, lucide-react
- **DB:** SQLite file at `server/data/krishisetu.db`, schema in `server/db.js`, seeded via `server/seed.js`
- **AI:** Anthropic API, key read server-side only from `process.env.ANTHROPIC_API_KEY`, never sent to or read by the client
- **No new dependencies** without checking with M1 first — every new package is an `npm install` every other member has to also run, and a new failure mode under deadline pressure

## 2. Folder structure (existing — extend in place, do not restructure)

```
KisanSetu/
├── server/
│   ├── index.js, db.js, seed.js
│   ├── data/distances.js
│   ├── lib/algorithms.js, lib/forecast.js (new)
│   └── routes/*.js (one file per resource)
└── client/
    ├── public/manifest.json, public/icons/ (new)
    └── src/
        ├── context/, lib/, components/, pages/
        └── i18n/ (new)
```

## 3. Database entities (do not rename fields — see server/db.js for full DDL)

- `users(id, username, password, role, display_name, phone, location, created_at)` — role ∈ {farmer, fpo, buyer, admin}
- `farmers(id, user_id, name, village, district, fpo_id, land_holding_acres, phone)`
- `fpos(id, user_id, name, district, registration_no, member_count, contact)`
- `buyers(id, user_id, name, buyer_type, location, verified, documents_verified, transactions_completed, payment_reliability_pct, response_rate_pct, contact)` — buyer_type ∈ {Processor, Wholesaler, Retail chain, Institutional buyer, Exporter, Digital trader}
- `crops(id, name, unit, category)`
- `markets(id, name, district, lat, lng)`
- `market_prices(id, market_id, crop_id, date, min_price, max_price, modal_price, arrival_qty_quintals)`
- `quality_grades(id, lot_id, grade, size_rating, moisture_rating, damage_pct, foreign_material_pct, appearance_rating, verified_by, verified, notes)` — grade ∈ {A,B,C}
- `lots(id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status, is_aggregated, source_lot_ids, created_at)` — owner_type ∈ {farmer, fpo}, status ∈ {Open for offers, Under negotiation, Sold, Closed, Withdrawn}
- `buyer_demands(id, buyer_id, crop_id, quantity_quintals, grade_required, required_by, offer_price, location, status, created_at)` — status ∈ {Open, Fulfilled, Expired, Cancelled}
- `offers(id, lot_id, buyer_id, offer_price, quantity_quintals, delivery_date, payment_terms, expiry_date, status, counter_of, created_at)` — status ∈ {Pending, Accepted, Rejected, Countered, Expired}
- `transactions(id, lot_id, offer_id, farmer_or_fpo_id, buyer_id, quantity_quintals, agreed_price, total_amount, stage, created_at)` — stage ∈ {Deal Accepted, Invoice Generated, Goods Dispatched, Goods Delivered, Payment Initiated, Payment Received}
- `logistics(id, transaction_id, pickup_location, destination, quantity_quintals, distance_km, transport_cost, vehicle_requirement, pickup_date, delivery_date, status, vehicle_no)` — status ∈ {Requested, Assigned, In Transit, Delivered}
- `storage_facilities(id, name, location, district, capacity_quintals, available_capacity_quintals, cost_per_day_per_quintal, crop_suitability, contact, verified)`
- `payments(id, transaction_id, amount, buyer_id, payee_id, date, method, status)` — status ∈ {Pending, Initiated, Received, Delayed}
- `grievances(id, transaction_id, raised_by, issue_category, description, evidence, status, resolution_notes, created_at, updated_at)` — issue_category ∈ {Quality dispute, Quantity dispute, Payment delay, Logistics issue, Buyer issue, Other}, status ∈ {Submitted, Under Review, Evidence Requested, Resolved, Rejected}
- `notifications(id, user_id, message, read, created_at)` — table exists, currently unused by any UI; M6 wires this up (do not change its shape).

New table for M5's ML feature (add via a migration block in `db.js`, do not touch existing tables):

```sql
CREATE TABLE IF NOT EXISTS forecast_runs (
  id TEXT PRIMARY KEY,
  crop_id TEXT REFERENCES crops(id),
  market_id TEXT REFERENCES markets(id),
  horizon_days INTEGER,
  method TEXT,
  predicted_price REAL,
  mae REAL, rmse REAL, r2 REAL,
  trained_on_rows INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 4. API contract rules

- REST, JSON in/out, existing route files own their resource — do not add cross-cutting routes into an unrelated file
- Query params camelCase (`cropId`, `marketId`, not `crop_id`) in URLs — note the DB column is snake_case, the API layer is camelCase; this mismatch is intentional and already exists, don't "fix" it
- Errors: `{ "error": "message" }` with appropriate status code (400 bad input, 404 not found, 401 auth) — matches existing routes, keep it consistent
- New endpoint for this sprint: `GET /api/forecast?cropId=&marketId=&horizonDays=` →
  ```json
  {
    "predictedPrice": 2350.5,
    "mae": 84.2, "rmse": 110.7, "r2": 0.61,
    "trainedOnRows": 34,
    "method": "linear-regression",
    "note": "Trained on demo-seeded historical data; not a production forecast."
  }
  ```
  If insufficient data: `{ "error": "insufficient historical data for this crop/market", "trainedOnRows": N }` with 200 status (not an error state for the frontend — a normal, honestly-labeled outcome) — frontend must render this as a plain message, not a crash.

## 5. Roles & permissions (unchanged, enforced client-side via `<Protected roles={[...]}>`)

farmer, fpo → Market Intelligence, Compare, Lots, Marketplace, Storage, Transactions, Grievances, Assistant. fpo additionally → FPO Aggregation. buyer → Marketplace, Transactions, Grievances. admin → Admin Dashboard, Grievances.

## 6. Naming conventions

- DB columns: `snake_case`. TS/JS variables and API query params: `camelCase`. React components: `PascalCase`. Files: match their default export's name.
- IDs: existing pattern is `nanoid(10)` for generated rows, human-readable prefixes for lots/grievances (`LOT-2026-NNNN`, `GRV-NNNN`) — follow this pattern for any new ID you generate, don't invent a new ID scheme.

## 7. i18n rules (M2's system, everyone else consumes it)

- All user-visible strings go through `t('key.path')` from `client/src/i18n/LocaleContext.tsx`
- Keys are dot-namespaced by page: `dashboard.title`, `login.demoAccounts`, etc.
- Never hardcode a string directly in JSX once `i18n/` exists — if you're adding a new screen string, add the key to all language files (`en.json` at minimum; `mr.json`/`hi.json` can say `"__TODO__"` if M2 hasn't translated it yet, but the key must exist in every file or the app crashes on switch)

## 8. Data honesty rules (non-negotiable, applies to every screen and every doc)

- Any price, buyer, farmer, or transaction shown is seeded/demo data — label it as such in the UI wherever it's the first time that data type appears on a screen
- Forecast numbers must come from the real `/api/forecast` response — never hardcode a "sample" MAE/RMSE/R² in the frontend for demo polish
- No slide, README line, or UI copy claims a live government integration, verified real buyers, or a specific accuracy percentage that isn't the literal output of the model

## 9. Environment variables

```
ANTHROPIC_API_KEY=   # optional; server-side only; assistant falls back gracefully if unset
PORT=4000            # server (existing default)
```

Never add a secret to any file under `client/`. Never commit `.env`.

## 10. Git workflow

See Part 15 of `01_MASTER_PLAN.md` — branch names, PR target (`develop`), freeze timing.

## 11. UI rules

- Reuse `client/src/components/ui.tsx` primitives (badges, stat cards, score bars) — don't hand-roll new versions of things that already exist there
- Follow existing Tailwind utility patterns already in the pages you're editing rather than introducing a new visual style — consistency matters more than novelty on a tight sprint
- No stock "AI robot" iconography, no fake testimonials, no fake statistics, no gradients/glassmorphism beyond what's already in the existing design — per the brief's human-designed requirement

## 12. Coding rules

- Match existing file style (this codebase is consistent — mirror it, don't reformat it)
- Every new DB write goes through a prepared statement (`db.prepare(...).run(...)`), matching existing routes — never string-concatenate SQL
- Every new algorithm function that produces a score or recommendation must return its named components, matching the existing pattern in `algorithms.js` — this is a hard requirement, not a style preference, because it's what "explainable" means in this product
