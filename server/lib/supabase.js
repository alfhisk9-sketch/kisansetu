/**
 * KisanSetu — Supabase Server Connector & Health Helper
 * 
 * Supports production PostgreSQL connectivity on Supabase.
 * Server holds SUPABASE_SERVICE_ROLE_KEY (never exposed to frontend).
 */

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
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

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
