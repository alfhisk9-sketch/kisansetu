// KisanSetu — service worker registration helper.
//
// The actual worker script lives at client/public/sw.js as plain JS, served
// unprocessed by Vite so it can run directly in the browser with no build
// step. This file just registers it. sw.js itself has two scopes: the app
// shell (M2) and GET /api/* offline caching (M6) — see the header comment
// in sw.js for the split.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Non-fatal: the app works fully without offline support.
      console.warn("Service worker registration failed:", err);
    });
  });
}
