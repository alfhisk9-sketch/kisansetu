const BASE = "/api";

// NOTE (M6, offline/notifications scope): the two additions below are the
// minimal hook needed to surface offline behavior in the UI without every
// page needing its own try/catch. This file isn't in M6's normal ownership
// list — flagging the touch here the same way offers.js/grievances.js are
// flagged in the PR description, for M1 to review.
async function request(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();

  // The service worker never intercepts or queues writes (see sw.js) — for
  // a write attempted while offline, fail fast with a clear message instead
  // of letting the browser throw an opaque network error.
  if (method !== "GET" && !navigator.onLine) {
    window.dispatchEvent(new CustomEvent("ks:offline-write-blocked"));
    throw new Error("You're offline — this action needs a connection.");
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  // Flagged by the service worker (sw.js) when a GET /api/* response came
  // from the offline cache rather than the network just now.
  if (method === "GET" && res.headers.get("X-KS-Cache") === "hit") {
    window.dispatchEvent(new CustomEvent("ks:stale-data"));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) => request(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
