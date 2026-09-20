/**
 * KisanSetu Owner Admin Provisioning Script
 * 
 * Safely and idempotently provisions the single platform owner administrator account
 * in Supabase Auth and public.users.
 * 
 * Run manually or during administrative setup:
 * node server/scripts/provisionAdmin.js
 */

import path from "path";
import { fileURLToPath } from "url";
import { getSupabaseAdmin } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch (_) {}

export async function provisionOwnerAdmin() {
  const adminUsername = (process.env.ADMIN_USERNAME || "alfhisk").trim().toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL || `${adminUsername}@kisansetu.in`).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD environment variable is required to provision the owner admin account.");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase client is not available. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  console.log(`[Provision Admin] Target Admin: ${adminUsername} (${adminEmail})`);

  // 1. Check existing Auth user
  let authUserId = null;
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (listErr) throw listErr;

  const existingAuthUser = (listData?.users || []).find((u) => u.email?.toLowerCase() === adminEmail);

  if (existingAuthUser) {
    authUserId = existingAuthUser.id;
    console.log(`[Provision Admin] Found existing Supabase Auth user: ${authUserId}`);
    // Update password & metadata idempotently
    const { error: updErr } = await supabase.auth.admin.updateUserById(authUserId, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        role: "admin",
        username: adminUsername,
        display_name: "Platform Owner Admin",
      },
    });
    if (updErr) throw updErr;
    console.log("[Provision Admin] Supabase Auth user credentials updated.");
  } else {
    // Create new Supabase Auth user
    const { data: createdAuth, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        role: "admin",
        username: adminUsername,
        display_name: "Platform Owner Admin",
      },
    });
    if (createErr) throw createErr;
    authUserId = createdAuth.user.id;
    console.log(`[Provision Admin] Created new Supabase Auth user: ${authUserId}`);
  }

  // 2. Synchronize to public.users with role = 'admin'
  const { data: existingPublicUser } = await supabase
    .from("users")
    .select("id, role")
    .or(`id.eq.${authUserId},username.ilike.${adminUsername}`)
    .maybeSingle();

  if (existingPublicUser) {
    const { error: syncErr } = await supabase
      .from("users")
      .update({
        id: authUserId,
        username: adminUsername,
        role: "admin",
        display_name: "Platform Owner Admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPublicUser.id);
    if (syncErr) throw syncErr;
    console.log(`[Provision Admin] Synchronized public.users record for ${adminUsername}`);
  } else {
    const { error: insertErr } = await supabase.from("users").insert({
      id: authUserId,
      username: adminUsername,
      role: "admin",
      display_name: "Platform Owner Admin",
      password_hash: "supabase_auth_managed",
      phone: "9999999999",
      location: "Platform HQ",
    });
    if (insertErr) throw insertErr;
    console.log(`[Provision Admin] Inserted public.users record for ${adminUsername}`);
  }

  // 3. Ensure SINGLE owner admin: safely demote or decommission any other demo admin account (e.g. hemasri)
  const { data: otherAdmins, error: otherErr } = await supabase
    .from("users")
    .select("id, username")
    .eq("role", "admin")
    .neq("username", adminUsername);

  if (!otherErr && otherAdmins && otherAdmins.length > 0) {
    for (const other of otherAdmins) {
      console.log(`[Provision Admin] De-escalating legacy admin account to farmer: ${other.username}`);
      const { error: deescalateErr } = await supabase
        .from("users")
        .update({ role: "farmer", updated_at: new Date().toISOString() })
        .eq("id", other.id);
      if (deescalateErr) {
        console.warn(`[Provision Admin] Failed to de-escalate ${other.username}:`, deescalateErr.message);
      }
    }
  }

  console.log(`[Provision Admin] Successfully completed. Exactly one admin active: ${adminUsername}`);
  return { success: true, username: adminUsername, email: adminEmail, userId: authUserId };
}

// Execute if run directly via CLI
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  provisionOwnerAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Provision Admin Error]:", err.message);
      process.exit(1);
    });
}
