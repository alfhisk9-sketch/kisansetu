// KisanSetu — service worker: app shell + API caching.
//
// Two scopes live in this one file, split by who owns the logic (per
// PROJECT_CONTRACT.md — a single sw.js is required since Vite serves it
// unprocessed, there's nowhere else for either half to live):
//   1. App shell caching (HTML entry point, manifest, icons, built JS/CSS)
//      — owned by the i18n/PWA lead (M2). See APP SHELL section below.
//   2. GET /api/* caching for offline viewing — owned by M6 (offline UX).
//      See API CACHING section below. Never touches POST/PATCH: write
//      offline handling is a clear-error message in the client
//      (client/src/lib/api.ts), not a service-worker queue — replay/sync
//      for offers and transactions was explicitly scoped out.
//
// Plain JS on purpose: this file is served as-is from client/public/ (Vite
// does not transpile files here), so it must run directly in the browser
// without a build step.

// v2: fixed a stale-shell bug — v1 served "/" cache-first forever, so once a
// browser had loaded the app once, rebuilt updates (new translations, new
// screens, etc.) never reached it again until the cache was cleared by hand.
// Bumping CACHE_NAME (so v1 caches are dropped on activate) plus
// skipWaiting()/clients.claim() (so this version takes over immediately,
// without waiting for every open tab to close) fixes existing installs too.
const CACHE_NAME = "krishisetu-shell-v2";
const APP_SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

// v1: API response cache, added by M6. Separate cache bucket from the app
// shell so the two can be versioned/cleared independently.
const API_CACHE_NAME = "krishisetu-api-v1";
const ALL_CACHE_NAMES = [CACHE_NAME, API_CACHE_NAME];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !ALL_CACHE_NAMES.includes(k)).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

// ---------------------------- API CACHING (M6) ----------------------------
// Network-first, cache-on-success, cache-fallback-on-failure for GET
// /api/* requests. This is what lets a previously-viewed page (Dashboard,
// Market Comparison for a crop already looked at, etc.) still render with
// its last-known data when offline.
//
// Note on strategy naming: the brief asked for "stale-while-revalidate".
// A textbook SWR always answers from cache first (even while fully online)
// and refreshes in the background — which means every repeat view would
// flash slightly-stale data before quietly updating. That conflicts with
// the contract's data-honesty rule ("never silently show old data as if it
// were current"), and it's needless noise when the network is fine. So
// this instead tries the network first and only falls back to cache on an
// actual failure (offline, or the API being down) — same practical result
// (last-known data still renders when offline) without the online-path
// staleness. Flagging this deviation explicitly per the contract's own
// "stop and flag rather than improvise" rule — happy to switch to literal
// SWR if the team prefers it.
//
// Every response this serves carries an `X-KS-Cache` header so the client
// (client/src/lib/api.ts) can tell the difference and surface it in the UI
// instead of rendering stale data as if it were current:
//   "miss"  — fresh from the network just now
//   "hit"   — the network failed; this is the last cached copy
async function tagResponse(res, cacheState) {
  const body = await res.blob();
  const headers = new Headers(res.headers);
  headers.set("X-KS-Cache", cacheState);
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

async function handleApiGet(req) {
  const cache = await caches.open(API_CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return tagResponse(fresh, "miss");
  } catch (err) {
    // Network unavailable — fall back to the last successful response for
    // this exact request (same URL + query string), if we have one.
    const cached = await cache.match(req);
    if (cached) return tagResponse(cached, "hit");
    // Nothing cached either: an honest failure, in the same predictable
    // { error } JSON shape the rest of the API uses (contract section 4).
    return new Response(
      JSON.stringify({ error: "You're offline and this data hasn't been loaded before." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/api/")) {
    // Writes are never intercepted or queued here — see note at top of file.
    if (req.method !== "GET") return;
    event.respondWith(handleApiGet(req));
    return;
  }

  // ---------------------------- APP SHELL (M2) ----------------------------
  // Only handle same-origin GETs; let everything else pass through untouched.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // The HTML shell must always be checked against the network first, with
  // the cache only as an offline fallback. Vite's built JS/CSS files are
  // content-hashed (a changed file always gets a new URL), so those remain
  // safe to serve cache-first — but the unhashed entry document is exactly
  // what went stale before, so it can never be cache-first.
  const isAppShellDocument =
    req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";

  if (isAppShellDocument) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Opportunistically cache newly-seen shell assets (JS/CSS chunks, etc.)
          if (res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match("/"));
    })
  );
});
