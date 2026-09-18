# RUNBOOK — KisanSetu

For whoever is running the demo in front of judges. Two terminals, two commands each.

## 1. Prerequisites

- Node.js 18+ (tested against Node 18/20)
- npm (bundled with Node)
- No external services required. `ANTHROPIC_API_KEY` is optional — the Assistant
  feature degrades gracefully to a deterministic rule-based answer without it
  (see contract section 9). Copy `server/.env.example` to `server/.env` if you
  want to set it; never commit the real `.env`.

## 2. First-time setup (clean checkout)

```bash
cd KisanSetu-FINAL

# Terminal A — backend
cd server
npm install
npm run seed        # resets and re-seeds server/data/krishisetu.db
npm run dev          # starts API on http://localhost:4000

# Terminal B — frontend
cd client
npm install
npm run dev           # starts Vite on http://localhost:5173
```

Open **http://localhost:5173** in the browser. Login with any account below.

Re-run `npm run seed` at any point to reset all demo data to a known state
(useful right before walking on stage).

## 3. Demo accounts

All passwords: `demo123`

| Role   | Username        | Name                                |
|--------|-----------------|--------------------------------------|
| Farmer | shaik.rabbani   | Shaik Rabbani                        |
| Farmer | shaik.alfhi     | Shaik Alfhi                          |
| FPO    | koushik         | Koushik (Guntur Farmers Producer Co.)|
| Buyer  | d.krishna       | D. Krishna                           |
| Buyer  | akshay          | Akshay                               |
| Admin  | hemasri         | Hemasri                              |

## 3a. Judge demo sequence (shortest reliable path, ~5 min)

1. Login as `shaik.rabbani` → Dashboard → **Market Intelligence**: pick a crop, see
   ranked markets by net realization.
2. **Compare** tab: same crop, see the reasoned recommendation and score
   breakdown.
3. **My Lots** → open the first lot → shows any incoming offer.
4. **Price Forecast** (new, M5): pick the same crop + a market, run a
   7–14 day forecast — shows predicted price, MAE/RMSE/R², and the
   demo-data disclaimer. Try a rarely-traded crop/market pair to show the
   honest "insufficient data" response instead of a fabricated number.
5. On the lot's offer, click Accept → a transaction is created.
6. **Grievances** → raise one against that transaction.
7. Logout, login as `hemasri` → **Admin Dashboard** (platform metrics) →
   **Grievances** → resolve the one just raised.
8. Logout, login as `shaik.rabbani` again → bell icon shows the new "grievance
   resolved" notification.
9. Logout, login as `d.krishna` → **Marketplace** → submit an offer on an open
   lot → **Transactions** shows it.
10. Logout, login as `koushik` → **FPO Aggregation** → shows member farmers'
    individual lots rolled up.
11. Switch the language selector (top bar) through Hindi / Marathi / Telugu
    at any point — every screen re-renders with no missing-key placeholders.

## 4. Health check

```bash
curl http://localhost:4000/api/health
# {"ok":true,"service":"krishisetu-market-api"}
```

If this fails, the frontend will load but every page will error on data fetch —
check Terminal A for the actual stack trace before doing anything else.

## 4a. API QA (optional, for re-verifying before a demo)

```bash
npm install -g newman   # once
newman run docs/postman_collection.json \
  --env-var "baseUrl=http://localhost:4000/api" \
  --env-var "lotId=<a real lot id from GET /api/lots>" \
  --env-var "offerId=<a real offer id from GET /api/offers>" \
  --env-var "transactionId=<a real transaction id>" \
  --env-var "grievanceId=<a real grievance id>" \
  --env-var "demandId=<a real demand id>"
```

Right after a fresh `npm run seed`, the fixed demo ids `LOT-2026-0031`,
`OFR-2001`, `TXN-3001`, `GRV-6001`, `DEM-1001` are valid — the full 65-request
collection passes 65/65 against them (see `FINAL_INTEGRATION_REPORT.md`).

## 5. Production build (optional, if presenting a built artifact instead of dev servers)

```bash
cd client
npm run build      # outputs client/dist — tsc -b then vite build
npm run preview     # serve the build locally to sanity-check it
```

The backend has no separate build step; `npm start` in `server/` runs the same
`index.js` as `npm run dev`.

## 6. Known non-issues (don't panic on these during setup)

- `npm install` in `server/` prints an npm deprecation warning for
  `prebuild-install` — harmless, ignore it.
- `npm run build` in `client/` prints a chunk-size warning
  (`dist/assets/index-*.js 657 kB`) — harmless for a hackathon demo, not a
  functional bug.
- Every price, buyer, farmer, and transaction in the demo is seeded/labelled
  data per the contract's data-honesty rule — this is intentional, not a bug.
- The forecast's R² can be negative for some crop/market/horizon combinations
  (there are only ~30 seeded days per pair, so a handful of held-out test
  points is expected to be noisy) — this is an honest small-sample result,
  not a computation bug; see `docs/MODEL_CARD.md` for the full methodology
  and why a negative R² is expected here. Never present it as a polished
  number — the response's `note` field already says so.

## 7. If something is actually broken

Check, in order:
1. Terminal A/B for the real error — most "frontend broken" reports are the
   API not running or not seeded.
2. `curl http://localhost:4000/api/health` — confirms backend is up at all.
3. Re-run `npm run seed` — resets to known-good state, fixes most data-drift
   issues from manual testing during prep.
4. If still stuck, this is a merge/integration issue — flag to the integration
   lead, don't hand-patch on stage.
