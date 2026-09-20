const BASE = "/api";

async function request(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();

  if (method !== "GET" && !navigator.onLine) {
    window.dispatchEvent(new CustomEvent("ks:offline-write-blocked"));
    throw new Error("You're offline — this action needs a connection.");
  }

  // Automatically attach auth session headers if present
  let authHeaders: Record<string, string> = {};
  try {
    const sessionRaw = localStorage.getItem("krishisetu_session");
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed.token) {
        authHeaders["Authorization"] = `Bearer ${parsed.token}`;
      }
      if (parsed.user?.id) {
        authHeaders["X-User-Id"] = parsed.user.id;
      }
    }
  } catch (_) {}

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(options.headers as any || {}),
      },
      ...options,
    });
  } catch (networkErr: any) {
    throw new Error("Unable to connect to market services. Please check your connection and try again.");
  }

  if (method === "GET" && res.headers.get("X-KS-Cache") === "hit") {
    window.dispatchEvent(new CustomEvent("ks:stale-data"));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 502 || res.status === 503) {
      throw new Error("Unable to connect to market services. Please try again.");
    }
    throw new Error(body.error || `Unable to complete request (${res.status}).`);
  }
  return res.json();
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) => request(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
