/**
 * KisanSetu — Client Supabase Connector
 * Only uses public anon key. NEVER uses service role key.
 */

const env = (import.meta as any).env || {};

export const isSupabaseClientConfigured = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
);

export const supabaseConfig = {
  url: env.VITE_SUPABASE_URL || "",
  hasKey: Boolean(env.VITE_SUPABASE_ANON_KEY),
};
