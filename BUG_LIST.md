# KisanSetu — Bug List

Owner: QA (feature/qa). Format: one line per bug — Page/Endpoint | What I did | What happened | What I expected | Severity | Owner-to-notify.

**⚠️ Status note (read first):** This pass is a **static code + API-contract review** of the delivered zip (`kisansetu-i18n-pwa-final-v3`), not yet a live run. This sandbox has no outbound network access, so `npm install` / `npm run seed` / a live server could not be executed here (`npm error 403 Forbidden` on registry.npmjs.org). Every bug below was traced by reading `server/routes/*.js`, `server/db.js`, and the client against `PROJECT_CONTRACT.md` line by line, and is annotated with the exact code path that causes it. **The Postman collection at `docs/postman_collection.json` is ready to run** — please run `npm install && npm run seed && npm run dev` locally (or in CI) and fire the collection (e.g. `newman run docs/postman_collection.json`) to convert these predictions into confirmed pass/fail results, then ping me and I'll update this file with actuals. I'll re-run the moment I have a reachable server.

Legend: 🔴 blocks demo · 🟡 cosmetic/non-blocking

---

## 🔴 Blocks demo

1. **`GET /api/forecast` — entire endpoint is missing** | Read `server/index.js` route mounts + `server/routes/` directory listing per contract §4 | No `forecast.js` route file exists, nothing is mounted in `index.js`, `server/lib/forecast.js` does not exist, and no client page/route (`client/src/pages/`, `App.tsx`) references `/forecast` anywhere. Only the empty `forecast_runs` table in `db.js` exists. | Contract §4 specifies this as "New endpoint for this sprint" with an exact response shape (`predictedPrice`, `mae`, `rmse`, `r2`, `trainedOnRows`, `method`, `note`) and an insufficient-data 200 response. Right now hitting it 404s and there's nothing for a judge to click on. | 🔴 blocks demo | **M5** (ML feature owner per contract's "M5's ML feature" framing) + **M1** (nothing to mount) — flag immediately, this is the single largest gap against the contract.

2. **Every POST/PATCH route with a JSON body skips input validation and crashes with a 500 instead of returning the contract's 400 shape on missing required fields** | Traced `req.body.<field>` usage with no `?? null` default across every write route | When a required field is omitted (e.g. `POST /lots` without `ownerId`, `POST /offers` without `lotId`, `POST /buyers/demands` without `buyerId`, `POST /grievances` without `transactionId`, `POST /lots/:id/grade` without `damagePct`, `PATCH /offers/:id/respond` with `action:"counter"` and no `counterPrice`), the field is `undefined` in JS. `better-sqlite3` throws a `TypeError` on an `undefined` bind parameter (it requires `null`, not `undefined`). This throw is caught by the generic error middleware in `index.js`, which returns **500** `{ "error": "Internal server error", "detail": "<raw driver message>" }`. | Contract §4: "400 bad input" with `{ "error": "message" }`. A missing-field mistake (very plausible from a rushed frontend form or a judge poking the API) currently surfaces as a 500 with a raw driver stack-trace string leaking in `detail`, not a clean 400. | 🔴 blocks demo (surfaces a raw exception message to the client on a very easy-to-trigger path, and 8+ endpoints share this pattern) | **Whoever owns `lots.js`, `offers.js`, `buyers.js`, `grievances.js`, `fpo.js`** (aggregate-lot route) — this is systemic, not one file's bug; suggest a shared `assertRequired(body, [...fields])` helper added once and reused, flag to **M1** for a cross-cutting fix decision.

3. **`PATCH /api/lots/:id/status` and `PATCH /api/grievances/:id` silently no-op on an unknown id instead of 404ing, and the frontend will crash trying to parse the response** | Read both handlers: `UPDATE ... WHERE id = ?` then immediately `SELECT ... WHERE id = ?` with no existence check in between, then `res.json(result)` | If `:id` doesn't match any row, the UPDATE affects 0 rows and the SELECT returns `undefined`. `res.json(undefined)` sends a **200 with an empty body**. `client/src/lib/api.ts`'s `request()` only checks `res.ok` (true for 200) then unconditionally calls `res.json()` — parsing an empty body throws a `SyntaxError` client-side, an unhandled promise rejection with no user-facing message. | Contract §4: 404 + `{ "error": "..." }` for not-found. Should 404 before ever touching the frontend. | 🔴 blocks demo (silent crash with zero on-screen feedback — worst possible judge-facing failure mode; stale UI state, e.g. a lot id cached client-side after a reseed, would trigger this) | Owner of `lots.js` and `grievances.js`.

## 🟡 Cosmetic / non-blocking

4. **No catch-all JSON 404 handler for unmatched API routes** | Read `server/index.js` top to bottom | Only a 5-arg error middleware exists (for thrown exceptions); there's no `app.use((req,res) => res.status(404).json({error:...}))` before it. A typo'd or old client-cached URL falls through to Express's default **HTML** 404 page, not JSON. | Contract §4 implies every error response is `{ "error": "message" }` — an HTML 404 breaks any frontend code that assumes JSON on every response. | 🟡 cosmetic (only hit by literal typos/dead links, not a normal user flow) | **M1** — one-line fix (`app.use()` before the error handler), worth doing regardless.

5. **`POST /api/lots/:id/grade` never checks the lot id in the URL actually exists** | Read the handler: it inserts into `quality_grades` and runs `UPDATE lots SET grade=? WHERE id=?` with no existence check, and `quality_grades.lot_id` has no `REFERENCES`/FK constraint in `db.js` | Grading a nonexistent lot returns **201** `{ grade, id }` as if it succeeded — a quality-grade row is created pointing at nothing, and the `UPDATE` silently affects 0 rows. | Should 404 like the sibling `lots.js` routes (`/:id`, `/:id/storage-decision`) already do. | 🟡 cosmetic (only reachable via a stale/typo'd lot id, not through the normal UI flow which always fetches the lot first) | Owner of `lots.js`.

6. **`GET /api/storage?cropName=...` calls `.split(',')` on `crop_suitability` unconditionally, and the column is nullable** | Read `storage.js`'s filter: `r.crop_suitability.split(",")...` runs over every row before checking match | Not reproducible with the current seed data (all 4 seeded facilities have `crop_suitability` populated), so this is a **latent** bug — but the schema (`server/db.js`) allows `NULL` here, and any future facility added without that field (e.g. by an admin form, if one gets built) will 500 the endpoint for *every* user, not just the row missing data. | Guard with `r.crop_suitability?.split(",")` or filter nulls first. | 🟡 cosmetic today, worth a preemptive one-line fix since it'd otherwise fail silently until demo day | Owner of `storage.js`.

7. **`markets.js` `/compare` response always includes a dead `minPrice: undefined` expression** | Read the `rawOptions.map()` block: `minPrice: series[series.length - 1] ? undefined : undefined` | This ternary evaluates to `undefined` on both branches — looks like a leftover/incomplete implementation. Since it's `undefined`, `JSON.stringify` drops the key entirely, so it's invisible in the actual API response (not a runtime bug), but it's dead code that suggests an intended field was never finished. | Either compute a real `minPrice` (e.g. lowest recent price in the series) or remove the dead line. | 🟡 cosmetic (no observable effect on judges, but flag before freeze so it isn't confused with a real missing-data bug during a code read) | Owner of `markets.js`.

8. **Buyer-demand / lot writes accept a `buyerId`/`ownerId`/`cropId` etc. without checking the referenced row actually exists** | `buyers.js` `POST /demands`, `lots.js` `POST /`, `grievances.js` `POST /` all bind whatever id string is given straight into the INSERT | SQLite has `foreign_keys = ON` (`db.js`) but a `REFERENCES` column with a **NULL** value is not checked — only non-null mismatches would throw, and even then a couple of referenced columns (e.g. `quality_grades.lot_id`, `payments.buyer_id`/`payee_id`) have no `REFERENCES` clause at all. So a garbage-but-non-null id like `"buyer-doesnotexist"` is silently accepted and stored — it doesn't error today because FK checks require the column to actually declare `REFERENCES`, which several of these don't. | Not a contract violation exactly (contract doesn't mandate FK-existence validation), but worth a heads-up since it can produce orphaned rows that show up as blank/broken-looking cards in the UI (e.g. a demand from a "buyer" that doesn't resolve to a real buyer name). | 🟡 cosmetic / data-integrity heads-up, not re-tested live yet | Whoever owns `buyers.js`, `lots.js`, `grievances.js` — low priority given the sprint deadline, only worth fixing if there's slack time.

---

## Compliant / verified-by-reading (no bug — noted so nobody re-litigates these)

- `GET /api/markets/prices` (missing `cropId`), `GET /api/markets/compare` (missing `district`), `GET /api/lots/:id/storage-decision` (missing `storageId`), `POST /api/fpo/:id/aggregate-lot` (missing `sourceLotIds`), `PATCH /api/offers/:id/respond` (invalid `action`), `POST /api/assistant/ask` (missing `question`), and every `:id` lookup in `buyers.js`/`fpo.js`/`lots.js`/`transactions.js` **do** return the contract's `400`/`404` + `{ "error": "..." }` shape correctly — confirmed by reading the code, these are the model to copy when fixing bugs #2/#3 above.
- i18n key parity: `en.json`, `hi.json`, `mr.json`, `te.json` all have exactly the same 353 dot-namespaced keys — no `__TODO__` placeholders left, no missing/extra keys in any locale. Contract §7's "must exist in every file or the app crashes on switch" requirement is currently satisfied.
- Server-side role enforcement is intentionally absent (contract §5 explicitly says roles are "enforced client-side via `<Protected roles={[...]}>`") — e.g. `GET /api/admin/summary` has no server-side admin check, but that's the documented design, not a bug. Flagging here only so it isn't mistakenly re-reported.
- Data-honesty rules (§8): spot-checked `markets.js` `/compare` and `lots.js` `/storage-decision` — both include explicit `disclaimer` fields in the JSON response ("demo/seeded market data", "scenario estimate, not a guaranteed price"). Good compliance where forecast-like numbers are shown.

---

## Manual smoke test — 6 demo accounts × role→page matrix

**Not yet performed.** This requires a running server + browser session, which this sandbox cannot provide (no network for `npm install`, no browser). Per contract §5 the walk is:

| Account | Password | Pages to click through |
|---|---|---|
| `farmer1` | demo123 | Dashboard, Market Intelligence, Compare, Lots, Lots detail, Marketplace, Storage, Transactions, Grievances, Assistant |
| `farmer2` | demo123 | same as farmer1 |
| `fpo1` | demo123 | all of the above **+ FPO Aggregation** |
| `buyer1` | demo123 | Dashboard, Marketplace, Transactions, Grievances |
| `buyer2` | demo123 | same as buyer1 |
| `admin1` | demo123 | Dashboard, Admin Dashboard, Grievances |

I'll run this the moment a reachable dev server exists (local machine or a deployed preview link) — please ping me with either and I'll execute the full click-through same day and log results here with per-page load/data/interactivity notes as originally scoped.

---

_Last updated: static pass only, pre-seed/pre-server. Will re-run both the Postman collection and full smoke test once M1 announces the develop→main freeze, and again after any post-freeze bugfix merge, per the QA role brief._
