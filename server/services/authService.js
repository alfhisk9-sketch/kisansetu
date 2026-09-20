import { getSupabaseAdmin } from "../lib/supabase.js";
import { hashPassword, generateToken, verifyPassword } from "../lib/security.js";
import { isOfflineDev, getDb } from "../db.js";
import { nanoid } from "nanoid";

/**
 * Fetch full user profile & role profile for a given user from Supabase or SQLite
 */
export async function fetchUserProfile(userId, role = null, isProduction = null) {
  if (isProduction === null) {
    isProduction = (process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true") || Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  let user = null;
  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    if (!role) {
      const { data: u } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
      if (!u) return null;
      user = u;
      role = u.role;
    } else {
      const { data: u } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
      user = u;
    }

    let roleProfile = null;
    if (role === "farmer") {
      const { data } = await supabase.from("farmers").select("*").eq("user_id", userId).maybeSingle();
      roleProfile = data || null;
    } else if (role === "fpo") {
      const { data } = await supabase.from("fpos").select("*").eq("user_id", userId).maybeSingle();
      roleProfile = data || null;
    } else if (role === "buyer") {
      const { data } = await supabase.from("buyers").select("*").eq("user_id", userId).maybeSingle();
      roleProfile = data || null;
    }

    return { user, roleProfile };
  }

  // SQLite fallback
  const db = getDb();
  if (!role) {
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    if (!user) return null;
    role = user.role;
  } else {
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  }

  let roleProfile = null;
  if (role === "farmer") roleProfile = db.prepare(`SELECT * FROM farmers WHERE user_id = ?`).get(userId) || null;
  else if (role === "fpo") roleProfile = db.prepare(`SELECT * FROM fpos WHERE user_id = ?`).get(userId) || null;
  else if (role === "buyer") roleProfile = db.prepare(`SELECT * FROM buyers WHERE user_id = ?`).get(userId) || null;

  return { user, roleProfile };
}

/**
 * Production-hardened user authentication
 * Supabase Auth is the authentication authority! Never validate passwords by reading public.users!
 */
export async function authenticateUser({ username, password }) {
  if (!username || !password) {
    return { success: false, statusCode: 400, error: "username and password are required" };
  }

  const isProduction = (process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true") || Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { success: false, statusCode: 503, error: "Production Database Unavailable: Supabase not configured" };
    }

    const trimmed = username.trim();
    const targetAdminUsername = (process.env.ADMIN_USERNAME || "alfhisk").trim().toLowerCase();
    const isAdminAttempt = trimmed.toLowerCase() === targetAdminUsername || trimmed.toLowerCase() === `${targetAdminUsername}@kisansetu.in`;
    const configuredAdminPassword = process.env.ADMIN_PASSWORD;

    // Check if owner admin credentials need sync
    if (isAdminAttempt && configuredAdminPassword && password === configuredAdminPassword) {
      try {
        const { provisionOwnerAdmin } = await import("../scripts/provisionAdmin.js");
        await provisionOwnerAdmin();
      } catch (err) {
        console.warn("[authenticateUser] Admin auto-provision notice:", err.message);
      }
    }

    let emailToAuth = trimmed;

    // 1. If username is not an email, find corresponding user record and resolve email
    let publicUser = null;
    const { data: foundUser } = await supabase
      .from("users")
      .select("*")
      .ilike("username", trimmed)
      .maybeSingle();

    if (foundUser) {
      publicUser = foundUser;
      if (publicUser.email) {
        emailToAuth = publicUser.email;
      } else {
        // Resolve email directly from Supabase Auth user record
        try {
          const { data: authUserData } = await supabase.auth.admin.getUserById(foundUser.id);
          if (authUserData?.user?.email) {
            emailToAuth = authUserData.user.email;
          } else {
            emailToAuth = trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@kisansetu.in`;
          }
        } catch {
          emailToAuth = trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@kisansetu.in`;
        }
      }
    } else {
      emailToAuth = trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@kisansetu.in`;
    }

    // 2. Validate credentials via Supabase Auth AUTHORITY using an ephemeral client
    const { createClient } = await import("@supabase/supabase-js");
    const { sanitizeEnvValue } = await import("../lib/supabase.js");
    const supabaseUrl = sanitizeEnvValue(process.env.SUPABASE_URL);
    const supabaseKey = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

    const authClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: authResult, error: authError } = await authClient.auth.signInWithPassword({
      email: emailToAuth,
      password: password
    });

    if (authError || !authResult?.user) {
      // Fallback for owner admin if configured password matches exactly
      if (isAdminAttempt && configuredAdminPassword && password === configuredAdminPassword) {
        const { data: adminRecord } = await supabase.from("users").select("*").ilike("username", targetAdminUsername).maybeSingle();
        if (adminRecord && adminRecord.role === "admin") {
          const authUserPayload = {
            id: adminRecord.id,
            email: `${targetAdminUsername}@kisansetu.in`,
            user_metadata: { role: "admin", username: targetAdminUsername, display_name: adminRecord.display_name || "Platform Owner Admin" },
            created_at: adminRecord.created_at
          };
          return await buildSessionResponse(authUserPayload, supabase, true);
        }
      }

      return {
        success: false,
        statusCode: 401,
        error: "Invalid username or password"
      };
    }

    return await buildSessionResponse(authResult.user, supabase, true);
  }

  // --- OFFLINE / DEVELOPMENT MODE (SQLite) ---
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`).get(username.trim());
  if (!user) {
    return { success: false, statusCode: 401, error: "Invalid username or password" };
  }

  const isValid = verifyPassword(password, user.password);
  if (!isValid) {
    return { success: false, statusCode: 401, error: "Invalid username or password" };
  }

  const profile = await fetchUserProfile(user.id, user.role, false);
  const token = generateToken(user.id, user.role);
  const { password: _pw, ...safeUser } = user;

  return { success: true, user: safeUser, profile, token };
}

/**
 * Builds standard session payload after successful Supabase Auth
 */
async function buildSessionResponse(authUser, supabase, isProduction) {
  let { data: publicUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!publicUser) {
    const meta = authUser.user_metadata || {};
    const username = meta.username || authUser.email?.split("@")[0] || `user_${authUser.id.slice(0, 8)}`;
    const role = meta.role || "farmer";
    const displayName = meta.display_name || meta.name || username;

    const { data: insertedUser, error: insErr } = await supabase
      .from("users")
      .upsert({
        id: authUser.id,
        username,
        password_hash: "supabase_auth_managed",
        role,
        display_name: displayName,
        phone: meta.phone || null,
        location: "Andhra Pradesh",
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (!insErr) publicUser = insertedUser;
  }

  const role = publicUser?.role || authUser.user_metadata?.role || "farmer";
  const profile = await fetchUserProfile(authUser.id, role, isProduction);
  const token = generateToken(authUser.id, role);

  const safeUser = publicUser ? {
    id: publicUser.id,
    username: publicUser.username,
    role: publicUser.role,
    display_name: publicUser.display_name,
    phone: publicUser.phone,
    location: publicUser.location,
    created_at: publicUser.created_at
  } : {
    id: authUser.id,
    username: authUser.email?.split("@")[0],
    role,
    display_name: authUser.user_metadata?.display_name || "User",
    created_at: authUser.created_at
  };

  return {
    success: true,
    user: safeUser,
    profile,
    token
  };
}

/**
 * Register a new user
 * Admin self-registration is strictly forbidden.
 */
export async function registerUser({
  username,
  password,
  confirmPassword,
  role,
  displayName,
  phone,
  location,
  village,
  district,
  buyerType,
  landHoldingAcres,
  registrationNo,
  memberCount
}) {
  if (role === "admin") {
    return { success: false, statusCode: 403, error: "Admin registration is not permitted through public registration" };
  }
  const REGISTERABLE_ROLES = ["farmer", "fpo", "buyer"];
  if (!REGISTERABLE_ROLES.includes(role)) {
    return { success: false, statusCode: 400, error: "role must be one of: farmer, fpo, buyer" };
  }

  if (password.length < 6) {
    return { success: false, statusCode: 400, error: "password must be at least 6 characters" };
  }

  if (password !== confirmPassword) {
    return { success: false, statusCode: 400, error: "password and confirmation do not match" };
  }

  const BUYER_TYPES = ["Processor", "Wholesaler", "Retail chain", "Institutional buyer", "Exporter", "Digital trader"];
  if (role === "buyer" && !BUYER_TYPES.includes(buyerType)) {
    return { success: false, statusCode: 400, error: `buyerType must be one of: ${BUYER_TYPES.join(", ")}` };
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { success: false, statusCode: 503, error: "Production Database Unavailable" };
    }

    const cleanUsername = username.trim().toLowerCase();
    const email = cleanUsername.includes("@") ? cleanUsername : `${cleanUsername}@kisansetu.in`;

    // 1. Check duplicate in public.users
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return { success: false, statusCode: 409, error: "That username is already taken. Please choose another." };
    }

    // 2. Create in Supabase Auth AUTHORITY
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        display_name: displayName.trim(),
        role,
        phone: phone.trim()
      }
    });

    if (authErr) {
      if (authErr.message?.includes("already registered") || authErr.message?.includes("duplicate")) {
        return { success: false, statusCode: 409, error: "An account with this email or username already exists." };
      }
      return { success: false, statusCode: 400, error: authErr.message };
    }

    const userId = authData.user.id;

    // 3. Upsert into Supabase public.users
    const { data: newUser, error: userInsErr } = await supabase
      .from("users")
      .insert({
        id: userId,
        username: cleanUsername,
        password_hash: "supabase_auth_managed",
        role,
        display_name: displayName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (userInsErr) {
      console.error("Failed to insert public.users row:", userInsErr.message);
      await supabase.auth.admin.deleteUser(userId);
      return { success: false, statusCode: 500, error: "Failed to persist user profile. Please try again." };
    }

    // 4. Create role-specific profile row in Supabase PostgreSQL
    let profile = null;
    if (role === "farmer") {
      const farmerId = `farmer-${nanoid(8)}`;
      const { data: fData, error: fErr } = await supabase
        .from("farmers")
        .insert({
          id: farmerId,
          user_id: userId,
          name: displayName.trim(),
          village: village || null,
          district: district || null,
          land_holding_acres: landHoldingAcres ? Number(landHoldingAcres) : null,
          phone: phone.trim()
        })
        .select()
        .single();
      if (!fErr) profile = fData;
    } else if (role === "fpo") {
      const fpoId = `fpo-${nanoid(8)}`;
      const { data: fpData, error: fpErr } = await supabase
        .from("fpos")
        .insert({
          id: fpoId,
          user_id: userId,
          name: displayName.trim(),
          district: district || null,
          registration_no: registrationNo || null,
          member_count: memberCount ? Number(memberCount) : 0,
          contact: phone.trim()
        })
        .select()
        .single();
      if (!fpErr) profile = fpData;
    } else if (role === "buyer") {
      const buyerId = `buyer-${nanoid(8)}`;
      const { data: bData, error: bErr } = await supabase
        .from("buyers")
        .insert({
          id: buyerId,
          user_id: userId,
          name: displayName.trim(),
          buyer_type: buyerType,
          location: location.trim(),
          verified: false,
          documents_verified: false,
          transactions_completed: 0,
          payment_reliability_pct: 0,
          response_rate_pct: 0,
          contact: phone.trim()
        })
        .select()
        .single();
      if (!bErr) profile = bData;
    }

    const token = generateToken(userId, role);
    const { password_hash: _ph, ...safeUser } = newUser;

    return {
      success: true,
      statusCode: 201,
      user: safeUser,
      profile,
      token
    };
  }

  // --- OFFLINE / DEVELOPMENT MODE (SQLite) ---
  const db = getDb();
  const existing = db.prepare(`SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)`).get(username.trim());
  if (existing) {
    return { success: false, statusCode: 409, error: "That username is already taken." };
  }

  const userId = `user-${nanoid(10)}`;
  const securePassword = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, username, password, role, display_name, phone, location) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, username.trim(), securePassword, role, displayName.trim(), phone.trim(), location.trim());

  let profile = null;
  if (role === "farmer") {
    const farmerId = `farmer-${nanoid(10)}`;
    db.prepare(
      `INSERT INTO farmers (id, user_id, name, village, district, fpo_id, land_holding_acres, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(farmerId, userId, displayName.trim(), village || null, district || null, null, landHoldingAcres || null, phone.trim());
    profile = db.prepare(`SELECT * FROM farmers WHERE id = ?`).get(farmerId);
  } else if (role === "fpo") {
    const fpoId = `fpo-${nanoid(10)}`;
    db.prepare(
      `INSERT INTO fpos (id, user_id, name, district, registration_no, member_count, contact) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(fpoId, userId, displayName.trim(), district || null, registrationNo || null, memberCount || 0, phone.trim());
    profile = db.prepare(`SELECT * FROM fpos WHERE id = ?`).get(fpoId);
  } else if (role === "buyer") {
    const buyerId = `buyer-${nanoid(10)}`;
    db.prepare(
      `INSERT INTO buyers (id, user_id, name, buyer_type, location, verified, documents_verified, transactions_completed, payment_reliability_pct, response_rate_pct, contact)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`
    ).run(buyerId, userId, displayName.trim(), buyerType, location.trim(), phone.trim());
    profile = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(buyerId);
  }

  const createdUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const token = generateToken(userId, role);
  const { password: _pw, ...safeUser } = createdUser;

  return { success: true, statusCode: 201, user: safeUser, profile, token };
}
