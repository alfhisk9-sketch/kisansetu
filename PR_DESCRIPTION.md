# feature/offline-notifications → develop

## Scope delivered
1. **Offline caching** (`client/public/sw.js`): app shell caching (M2's
   section, untouched in logic) + new GET `/api/*` caching so a
   previously-viewed page still renders with last-known data when offline.
2. **Notifications**: wired up the existing, previously-unused
   `notifications` table — new `server/routes/notifications.js`
   (`GET /api/notifications?userId=`, `PATCH /api/notifications/:id/read`),
   a bell + unread badge in `Layout.tsx`, and INSERTs at two trigger points.

Confirmed before building: `notifications` table shape already matched the
contract exactly, and a repo-wide grep showed only `seed.js` touched it —
no existing route/page duplicated.

## Files touched outside normal ownership — please review closely
- **`server/routes/offers.js`** — added a notification INSERT after a new
  offer is created, to the lot owner (resolved lot → `farmers`/`fpos` →
  `user_id` depending on `owner_type`). No other lines changed.
- **`server/routes/grievances.js`** — added a notification INSERT after a
  grievance's status is updated, to whoever raised it (`raised_by` isn't
  typed, so it's resolved via a `UNION` across `farmers`/`fpos`/`buyers`).
  Also added the `nanoid` import (already a dependency). No other lines
  changed.
- **`client/src/lib/api.ts`** — not in my listed ownership, but the
  "clear offline-write message" and "flag stale data" requirements can't be
  met without a shared hook (per-page wiring would mean touching every page
  that does a POST/PATCH or GET, most of which have no error handling
  today). Added ~15 lines: an offline pre-check on writes that dispatches
  `ks:offline-write-blocked` and throws a clear message, and a check on GET
  responses for an `X-KS-Cache: hit` header (set by the service worker) that
  dispatches `ks:stale-data`. `Layout.tsx` listens for both. Nothing else in
  the file changed.
- **`client/src/serviceWorker.ts`** — only its header comment changed, to
  reflect that both scopes in `sw.js` are now implemented (was previously
  written when the API-caching half was still TODO).

## One deliberate deviation — flagging per the contract's own rule
The brief asked for a **stale-while-revalidate** strategy for `/api/*` GETs.
I implemented **network-first with cache-fallback-on-failure** instead.
Reasoning (also in a comment in `sw.js`): textbook SWR always serves from
cache first — even while fully online — and refreshes in the background,
so every repeat view would briefly show slightly-stale data before quietly
updating. That's in tension with the contract's data-honesty rule ("never
silently show old data as if it were current") and adds visible staleness
for no benefit when the network is fine. Network-first-with-fallback gets
the same practical outcome the brief actually wants — a previously-loaded
page still renders when offline — without that online-path staleness.
Happy to switch to literal SWR if the team prefers matching the term
exactly; flagging rather than silently deviating, per contract §0.

## Not built (explicitly out of scope, per the brief)
- No offline write queueing/sync for POST/PATCH (offers, transactions).
  Blocked with a clear "you're offline" message instead (see `api.ts` note
  above).
- `client/public/manifest.json` untouched (M2's).
- `algorithms.js` untouched.

## docs/BUG_LIST.md
This file doesn't exist in the repo as handed off to me — nothing to check
yet. Following up with M3.

## How to verify
- `npm install && npm run seed` in `server/`, `npm run dev` in both
  `server/` and `client/`.
- `npx tsc --noEmit` and `npx vite build` both pass clean in `client/`.
- To see the offline path: load a page once online (e.g. Dashboard), then
  toggle "Offline" in DevTools → Network and reload — the page should still
  render with an amber "you're offline" banner. Submitting an offer/
  grievance while offline should show a red "needs a connection" message
  instead of failing silently.
- To see notifications: create an offer on a lot as a buyer, then log in as
  that lot's farmer/FPO — the bell badge should show 1 unread.
