import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * KisanSetu — Client Supabase Connector
 * Only uses public anon key (VITE_SUPABASE_ANON_KEY). NEVER uses service role key.
 */

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseClientConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseConfig = {
  url: supabaseUrl,
  hasKey: Boolean(supabaseAnonKey),
};

export const supabase: SupabaseClient | null = isSupabaseClientConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
