import { createClient } from "@supabase/supabase-js";

export function sanitizeEnvValue(val) {
  if (!val) return "";
  let clean = String(val).trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

export function isProductionEnv() {
  if (process.env.ALLOW_OFFLINE_DEV === "true") return false;
  return (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_OFFLINE_DEV === "false" ||
    Boolean(process.env.RENDER) ||
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function getServiceKeyRole() {
  const key = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) return "MISSING";
  try {
    const parts = key.split(".");
    if (parts.length < 2) return "INVALID_JWT_FORMAT";
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return payload.role || "unknown";
  } catch {
    return "DECODE_ERROR";
  }
}

let _supabaseAdmin = null;

export function getSupabaseAdmin() {
  const url = sanitizeEnvValue(process.env.SUPABASE_URL);
  const key = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _supabaseAdmin;
}

export function getSupabaseConfig() {
  const url = sanitizeEnvValue(process.env.SUPABASE_URL) || null;
  const key = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
  const hasConfig = Boolean(url && key);
  return {
    configured: hasConfig,
    url: url ? url.replace(/^(https?:\/\/)(.*)/, "$1***") : null, // Masked for safety
  };
}

export async function checkSupabaseHealth() {
  const { configured } = getSupabaseConfig();
  if (!configured) {
    return {
      status: "unconfigured",
      mode: "local-sqlite",
      message: "Operating on local SQLite engine (SUPABASE_URL not configured).",
    };
  }

  const url = sanitizeEnvValue(process.env.SUPABASE_URL);
  const key = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const res = await fetch(`${url}/rest/v1/crops?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (res.ok) {
      return {
        status: "healthy",
        mode: "supabase-postgres",
        message: "Successfully connected to Supabase PostgreSQL.",
      };
    } else {
      return {
        status: "error",
        mode: "supabase-postgres",
        statusCode: res.status,
        message: "Supabase connection responded with non-200 status.",
      };
    }
  } catch (err) {
    return {
      status: "unreachable",
      mode: "supabase-postgres",
      error: err.message,
    };
  }
}
