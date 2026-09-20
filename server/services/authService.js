import { getSupabaseAdmin } from "../lib/supabase.js";
import { hashPassword, generateToken, verifyPassword } from "../lib/security.js";
import { isOfflineDev, getDb } from "../db.js";
import { nanoid } from "nanoid";

export const DEMO_ACCOUNTS_METADATA = [
  {
    username: "shaik.rabbani",
    name: "Shaik Rabbani",
    role: "farmer",
    email: "shaik.rabbani@kisansetu.in",
    phone: "9440010001",
    location: "Duggirala, Guntur",
    village: "Duggirala",
    district: "Guntur",
    landHoldingAcres: 4.5,
    roleTitle: "Farmer"
  },
  {
    username: "shaik.alfhi",
    name: "Shaik Alfhi",
    role: "farmer",
    email: "shaik.alfhi@kisansetu.in",
    phone: "9440010002",
    location: "Tenali, Guntur",
    village: "Tenali",
    district: "Guntur",
    landHoldingAcres: 2.8,
    roleTitle: "Farmer 2"
  },
  {
    username: "koushik",
    name: "Koushik",
    role: "fpo",
    email: "koushik@kisansetu.in",
    phone: "9440010010",
    location: "Guntur",
    district: "Guntur",
    registrationNo: "FPO/AP/2019/1042",
    memberCount: 42,
    roleTitle: "FPO Lead"
  },
  {
    username: "d.krishna",
    name: "D. Krishna",
    role: "buyer",
    email: "d.krishna@kisansetu.in",
    phone: "9440010020",
    location: "Vijayawada",
    buyerType: "Wholesaler",
    verified: true,
    roleTitle: "Wholesaler"
  },
  {
    username: "akshay",
    name: "Akshay",
    role: "buyer",
    email: "akshay@kisansetu.in",
    phone: "9440010021",
    location: "Visakhapatnam",
    buyerType: "Digital trader",
    verified: true,
    roleTitle: "Trader"
  },
  {
    username: "hemasri",
    name: "Hemasri",
    role: "admin",
    email: "hemasri@kisansetu.in",
    phone: "9440010099",
    location: "Vijayawada",
    roleTitle: "Admin"
  }
];

export const DEMO_PASSWORD = "demo123";

/**
 * Idempotently provisions demo accounts into Supabase Auth and Supabase PostgreSQL.
 * Safe to run multiple times without creating duplicates.
 */
export async function syncDemoAccountsToSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }

  // 1. Fetch existing Supabase Auth users
  const { data: authList, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new Error(`Failed to list Supabase Auth users: ${listErr.message}`);
  }

  const existingAuthByEmail = new Map(
    (authList?.users || []).map((u) => [u.email?.toLowerCase(), u])
  );

  const results = [];

  for (const demo of DEMO_ACCOUNTS_METADATA) {
    const demoEmail = demo.email.toLowerCase();
    let authUser = existingAuthByEmail.get(demoEmail);

    if (!authUser) {
      // Create user in Supabase Auth authority
      const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
        email: demoEmail,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          username: demo.username,
          display_name: demo.name,
          role: demo.role,
          phone: demo.phone
        }
      });

      if (createErr) {
        console.error(`Failed to create demo auth user ${demo.username}:`, createErr.message);
        results.push({ username: demo.username, status: "auth_create_failed", error: createErr.message });
        continue;
      }
      authUser = createData.user;
    } else {
      // Update password and metadata to guarantee demo123 always works
      await supabase.auth.admin.updateUserById(authUser.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          username: demo.username,
          display_name: demo.name,
          role: demo.role,
          phone: demo.phone
        }
      });
    }

    const userId = authUser.id;

    // 2. Synchronize Supabase public.users row
    const userPayload = {
      id: userId,
      username: demo.username,
      password_hash: hashPassword(DEMO_PASSWORD),
      role: demo.role,
      display_name: demo.name,
      phone: demo.phone,
      location: demo.location,
      updated_at: new Date().toISOString()
    };

    const { error: userErr } = await supabase
      .from("users")
      .upsert(userPayload, { onConflict: "username" });

    if (userErr) {
      console.error(`Failed to upsert demo public.user ${demo.username}:`, userErr.message);
      results.push({ username: demo.username, status: "public_user_failed", error: userErr.message });
      continue;
    }

    // 3. Synchronize role-specific profile row in Supabase PostgreSQL
    if (demo.role === "farmer") {
      const { data: existingFarmer } = await supabase
        .from("farmers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const farmerId = existingFarmer?.id || `farmer-${userId.slice(0, 10)}`;
      await supabase.from("farmers").upsert({
        id: farmerId,
        user_id: userId,
        name: demo.name,
        village: demo.village,
        district: demo.district,
        land_holding_acres: demo.landHoldingAcres,
        phone: demo.phone
      }, { onConflict: "id" });
    } else if (demo.role === "fpo") {
      const { data: existingFpo } = await supabase
        .from("fpos")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const fpoId = existingFpo?.id || `fpo-${userId.slice(0, 10)}`;
      await supabase.from("fpos").upsert({
        id: fpoId,
        user_id: userId,
        name: demo.name,
        district: demo.district,
        registration_no: demo.registrationNo,
        member_count: demo.memberCount,
        contact: demo.phone
      }, { onConflict: "id" });
    } else if (demo.role === "buyer") {
      const { data: existingBuyer } = await supabase
        .from("buyers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const buyerId = existingBuyer?.id || `buyer-${userId.slice(0, 10)}`;
      await supabase.from("buyers").upsert({
        id: buyerId,
        user_id: userId,
        name: demo.name,
        buyer_type: demo.buyerType,
        location: demo.location,
        verified: demo.verified,
        contact: demo.phone
      }, { onConflict: "id" });
    }

    results.push({ username: demo.username, role: demo.role, userId, status: "synced" });
  }

  return { success: true, count: results.length, results };
}

/**
 * Fetch full user profile & role profile for a given user from Supabase or SQLite
 */
export async function fetchUserProfile(userId, role = null, isProduction = null) {
  if (isProduction === null) {
    isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
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

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { success: false, statusCode: 503, error: "Production Database Unavailable: Supabase not configured" };
    }

    const trimmed = username.trim();
    let emailToAuth = trimmed;

    // 1. If username is not an email, find corresponding user record or demo account email
    let publicUser = null;
    const { data: foundUser } = await supabase
      .from("users")
      .select("*")
      .ilike("username", trimmed)
      .maybeSingle();

    if (foundUser) {
      publicUser = foundUser;
      const demoMatch = DEMO_ACCOUNTS_METADATA.find(
        (d) => d.username.toLowerCase() === publicUser.username.toLowerCase()
      );
      emailToAuth = demoMatch ? demoMatch.email : (publicUser.email || `${publicUser.username}@kisansetu.in`);
    } else {
      const demoMatch = DEMO_ACCOUNTS_METADATA.find(
        (d) => d.username.toLowerCase() === trimmed.toLowerCase()
      );
      if (demoMatch) {
        emailToAuth = demoMatch.email;
      } else if (!trimmed.includes("@")) {
        emailToAuth = `${trimmed}@kisansetu.in`;
      }
    }

    // 2. Validate credentials via Supabase Auth AUTHORITY using an ephemeral client
    // so getSupabaseAdmin() never has its session state replaced with the user's session
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: authResult, error: authError } = await authClient.auth.signInWithPassword({
      email: emailToAuth,
      password: password
    });

    if (authError || !authResult?.user) {
      // If demo user login failed, try syncing demo users once then retry
      const isDemo = DEMO_ACCOUNTS_METADATA.some((d) => d.username.toLowerCase() === trimmed.toLowerCase());
      if (isDemo) {
        try {
          await syncDemoAccountsToSupabase();
          const { data: retryAuth, error: retryErr } = await authClient.auth.signInWithPassword({
            email: emailToAuth,
            password: password
          });
          if (retryAuth?.user) {
            return await buildSessionResponse(retryAuth.user, supabase, true);
          }
        } catch (e) {
          console.warn("Demo account on-demand sync error:", e.message);
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
