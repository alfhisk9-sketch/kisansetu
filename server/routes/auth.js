import { Router } from "express";
import { nanoid } from "nanoid";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { assertRequired } from "../lib/validate.js";
import { hashPassword, verifyPassword, generateToken } from "../lib/security.js";
import {
  authenticateUser,
  registerUser,
  syncDemoAccountsToSupabase,
  fetchUserProfile,
  DEMO_ACCOUNTS_METADATA
} from "../services/authService.js";
import { getRequestUser } from "../lib/authMiddleware.js";

const router = Router();

/**
 * Production-grade authentication with Supabase Auth authority
 */
router.post("/login", async (req, res) => {
  if (!assertRequired(req, res, ["username", "password"])) return;
  const { username, password } = req.body;

  try {
    const result = await authenticateUser({ username, password });
    if (!result.success) {
      return res.status(result.statusCode || 401).json({ error: result.error || "Invalid username or password" });
    }
    res.json({ user: result.user, profile: result.profile, token: result.token });
  } catch (err) {
    console.error("Login route error:", err);
    res.status(500).json({ error: "Authentication service encountered an error. Please try again." });
  }
});

/**
 * Self-registration with Supabase Auth user & profile persistence
 */
router.post("/register", async (req, res) => {
  if (!assertRequired(req, res, ["username", "password", "confirmPassword", "role", "displayName", "phone", "location"])) return;

  try {
    const result = await registerUser(req.body);
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }
    res.status(result.statusCode || 201).json({ user: result.user, profile: result.profile, token: result.token });
  } catch (err) {
    console.error("Register route error:", err);
    res.status(500).json({ error: "Registration service encountered an error. Please try again." });
  }
});

/**
 * List verified demo accounts
 */
router.get("/demo-accounts", (req, res) => {
  res.json({
    note: "Demo credentials for reviewers and evaluators. Password is 'demo123' for all accounts.",
    accounts: DEMO_ACCOUNTS_METADATA.map((d) => ({
      role: d.role,
      username: d.username,
      name: `${d.name} (${d.roleTitle})`
    }))
  });
});

/**
 * Safe on-demand demo account provisioning endpoint
 */
router.post("/sync-demo", async (req, res) => {
  try {
    const result = await syncDemoAccountsToSupabase();
    res.json(result);
  } catch (err) {
    console.error("Demo sync route error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/profile
 * Retrieves authenticated user profile & role profile
 */
router.get("/profile", async (req, res) => {
  const reqUser = await getRequestUser(req);
  if (!reqUser) {
    return res.status(401).json({ error: "Unauthorized: valid session or token required" });
  }

  const profileData = await fetchUserProfile(reqUser.id);
  if (!profileData || !profileData.user) {
    return res.status(404).json({ error: "User profile not found" });
  }

  res.json({
    user: profileData.user,
    roleProfile: profileData.roleProfile,
    profile: profileData.roleProfile,
  });
});

router.get("/me", async (req, res) => {
  const reqUser = await getRequestUser(req);
  if (!reqUser) {
    return res.status(401).json({ error: "Unauthorized: valid session or token required" });
  }

  const profileData = await fetchUserProfile(reqUser.id);
  if (!profileData || !profileData.user) {
    return res.status(404).json({ error: "User profile not found" });
  }

  res.json({
    user: profileData.user,
    roleProfile: profileData.roleProfile,
    profile: profileData.roleProfile,
  });
});

/**
 * Update user profile
 */
router.patch("/profile", async (req, res) => {
  if (!assertRequired(req, res, ["userId"])) return;
  const { userId, displayName, phone, location } = req.body;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (uErr || !user) return res.status(404).json({ error: "unknown userId" });

    // Update user row
    const userUpdates = { updated_at: new Date().toISOString() };
    if (displayName) userUpdates.display_name = displayName;
    if (phone) userUpdates.phone = phone;
    if (location) userUpdates.location = location;

    await supabase.from("users").update(userUpdates).eq("id", userId);

    // Update role profile row
    let profile = null;
    if (user.role === "farmer") {
      const fUpdates = {};
      if (displayName) fUpdates.name = displayName;
      if (phone) fUpdates.phone = phone;
      if (req.body.village !== undefined) fUpdates.village = req.body.village;
      if (req.body.district !== undefined) fUpdates.district = req.body.district;
      if (req.body.landHoldingAcres !== undefined) fUpdates.land_holding_acres = Number(req.body.landHoldingAcres);

      await supabase.from("farmers").update(fUpdates).eq("user_id", userId);
      const { data: fData } = await supabase.from("farmers").select("*").eq("user_id", userId).maybeSingle();
      profile = fData;
    } else if (user.role === "fpo") {
      const fpUpdates = {};
      if (displayName) fpUpdates.name = displayName;
      if (phone) fpUpdates.contact = phone;
      if (req.body.district !== undefined) fpUpdates.district = req.body.district;

      await supabase.from("fpos").update(fpUpdates).eq("user_id", userId);
      const { data: fpData } = await supabase.from("fpos").select("*").eq("user_id", userId).maybeSingle();
      profile = fpData;
    } else if (user.role === "buyer") {
      const bUpdates = {};
      if (displayName) bUpdates.name = displayName;
      if (phone) bUpdates.contact = phone;
      if (location) bUpdates.location = location;

      await supabase.from("buyers").update(bUpdates).eq("user_id", userId);
      const { data: bData } = await supabase.from("buyers").select("*").eq("user_id", userId).maybeSingle();
      profile = bData;
    }

    const { data: updatedUser } = await supabase.from("users").select("*").eq("id", userId).single();
    const { password_hash: _ph, ...safeUser } = updatedUser;
    return res.json({ user: safeUser, profile });
  }

  // SQLite fallback
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: "unknown userId" });

  db.prepare(
    `UPDATE users SET display_name = COALESCE(?, display_name), phone = COALESCE(?, phone), location = COALESCE(?, location) WHERE id = ?`
  ).run(displayName || null, phone || null, location || null, userId);

  let profile = null;
  if (user.role === "farmer") {
    if (req.body.village !== undefined || req.body.district !== undefined || req.body.landHoldingAcres !== undefined) {
      db.prepare(
        `UPDATE farmers SET name = COALESCE(?, name), village = COALESCE(?, village), district = COALESCE(?, district), land_holding_acres = COALESCE(?, land_holding_acres), phone = COALESCE(?, phone) WHERE user_id = ?`
      ).run(displayName || null, req.body.village || null, req.body.district || null, req.body.landHoldingAcres || null, phone || null, userId);
    } else {
      db.prepare(`UPDATE farmers SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE user_id = ?`).run(displayName || null, phone || null, userId);
    }
    profile = db.prepare(`SELECT * FROM farmers WHERE user_id = ?`).get(userId);
  } else if (user.role === "fpo") {
    db.prepare(
      `UPDATE fpos SET name = COALESCE(?, name), district = COALESCE(?, district), contact = COALESCE(?, contact) WHERE user_id = ?`
    ).run(displayName || null, req.body.district || null, phone || null, userId);
    profile = db.prepare(`SELECT * FROM fpos WHERE user_id = ?`).get(userId);
  } else if (user.role === "buyer") {
    db.prepare(
      `UPDATE buyers SET name = COALESCE(?, name), location = COALESCE(?, location), contact = COALESCE(?, contact) WHERE user_id = ?`
    ).run(displayName || null, location || null, phone || null, userId);
    profile = db.prepare(`SELECT * FROM buyers WHERE user_id = ?`).get(userId);
  }

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const { password: _pw, ...safeUser } = updatedUser;
  res.json({ user: safeUser, profile });
});

/**
 * Change user password
 */
router.post("/change-password", async (req, res) => {
  if (!assertRequired(req, res, ["userId", "currentPassword", "newPassword", "confirmNewPassword"])) return;
  const { userId, currentPassword, newPassword, confirmNewPassword } = req.body;

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: "New password and confirmation do not match" });
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    const { data: user } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (!user) return res.status(404).json({ error: "unknown userId" });

    const email = user.username.includes("@") ? user.username : `${user.username}@kisansetu.in`;

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error: verifyErr } = await authClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (verifyErr) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message });
    }

    return res.json({ ok: true, message: "Password updated successfully" });
  }

  // SQLite fallback
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: "unknown userId" });
  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const securePassword = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(securePassword, userId);
  res.json({ ok: true, message: "Password updated successfully" });
});

/**
 * Google OAuth Synchronization with Supabase Auth
 */
router.post("/sync-oauth", async (req, res) => {
  const { email, fullName, avatarUrl, supabaseUserId, role } = req.body;
  if (!email || !supabaseUserId) {
    return res.status(400).json({ error: "email and supabaseUserId are required" });
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    // 1. Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .or(`id.eq.${supabaseUserId},username.ilike.${email}`)
      .maybeSingle();

    if (existingUser) {
      const profile = await fetchUserProfile(existingUser.id, existingUser.role, true);
      const token = generateToken(existingUser.id, existingUser.role);
      const { password_hash: _ph, ...safeUser } = existingUser;
      return res.json({ user: safeUser, profile, token, isNewUser: false });
    }

    // 2. If new user and no role selected yet
    if (!role) {
      return res.json({
        needsRoleSelection: true,
        email,
        fullName: fullName || email.split("@")[0],
        supabaseUserId,
        avatarUrl: avatarUrl || null,
        allowedRoles: ["farmer", "buyer", "fpo"]
      });
    }

    // 3. User is new and role selected (Strictly no admin self-selection)
    if (!["farmer", "buyer", "fpo"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Self-selection of Admin role is prohibited." });
    }

    const displayName = fullName || email.split("@")[0];

    const { data: createdUser, error: insErr } = await supabase
      .from("users")
      .insert({
        id: supabaseUserId,
        username: email.toLowerCase(),
        password_hash: "supabase_oauth_managed",
        role,
        display_name: displayName,
        phone: "",
        location: "Andhra Pradesh",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insErr) {
      return res.status(500).json({ error: `Failed to create user: ${insErr.message}` });
    }

    let profile = null;
    if (role === "farmer") {
      const farmerId = `farmer-${nanoid(8)}`;
      const { data: fData } = await supabase.from("farmers").insert({
        id: farmerId,
        user_id: supabaseUserId,
        name: displayName,
        district: "Guntur"
      }).select().single();
      profile = fData;
    } else if (role === "fpo") {
      const fpoId = `fpo-${nanoid(8)}`;
      const { data: fpData } = await supabase.from("fpos").insert({
        id: fpoId,
        user_id: supabaseUserId,
        name: displayName,
        district: "Guntur"
      }).select().single();
      profile = fpData;
    } else if (role === "buyer") {
      const buyerId = `buyer-${nanoid(8)}`;
      const { data: bData } = await supabase.from("buyers").insert({
        id: buyerId,
        user_id: supabaseUserId,
        name: displayName,
        buyer_type: "Wholesaler",
        location: "Andhra Pradesh",
        verified: true
      }).select().single();
      profile = bData;
    }

    const token = generateToken(createdUser.id, createdUser.role);
    const { password_hash: _ph, ...safeUser } = createdUser;
    return res.status(201).json({ user: safeUser, profile, token, isNewUser: true });
  }

  // SQLite fallback
  const db = getDb();
  let user = db.prepare(`SELECT * FROM users WHERE supabase_user_id = ? OR LOWER(username) = LOWER(?)`).get(supabaseUserId, email);

  if (user) {
    db.prepare(`UPDATE users SET supabase_user_id = ?, avatar_url = COALESCE(?, avatar_url), auth_provider = 'google' WHERE id = ?`)
      .run(supabaseUserId, avatarUrl || null, user.id);

    let profile = null;
    if (user.role === "farmer") profile = db.prepare(`SELECT * FROM farmers WHERE user_id = ?`).get(user.id);
    if (user.role === "fpo") profile = db.prepare(`SELECT * FROM fpos WHERE user_id = ?`).get(user.id);
    if (user.role === "buyer") profile = db.prepare(`SELECT * FROM buyers WHERE user_id = ?`).get(user.id);

    const token = generateToken(user.id, user.role);
    const { password: _pw, ...safeUser } = user;
    return res.json({ user: safeUser, profile, token, isNewUser: false });
  }

  if (!role) {
    return res.json({
      needsRoleSelection: true,
      email,
      fullName: fullName || email.split("@")[0],
      supabaseUserId,
      avatarUrl: avatarUrl || null,
      allowedRoles: ["farmer", "buyer", "fpo"]
    });
  }

  if (!["farmer", "buyer", "fpo"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Self-selection of Admin role is prohibited." });
  }

  const newUserId = `user-${nanoid(10)}`;
  const displayName = fullName || email.split("@")[0];
  const initialPasswordHash = hashPassword(nanoid(24));

  db.prepare(`
    INSERT INTO users (id, username, password, role, display_name, phone, location, auth_provider, supabase_user_id, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'google', ?, ?, datetime('now'))
  `).run(newUserId, email, initialPasswordHash, role, displayName, "", "Andhra Pradesh", supabaseUserId, avatarUrl || null);

  let profile = null;
  if (role === "farmer") {
    const farmerId = `farmer-${nanoid(8)}`;
    db.prepare(`INSERT INTO farmers (id, user_id, name, district) VALUES (?, ?, ?, 'Guntur')`).run(farmerId, newUserId, displayName);
    profile = db.prepare(`SELECT * FROM farmers WHERE id = ?`).get(farmerId);
  } else if (role === "fpo") {
    const fpoId = `fpo-${nanoid(8)}`;
    db.prepare(`INSERT INTO fpos (id, user_id, name, district) VALUES (?, ?, ?, 'Guntur')`).run(fpoId, newUserId, displayName);
    profile = db.prepare(`SELECT * FROM fpos WHERE id = ?`).get(fpoId);
  } else if (role === "buyer") {
    const buyerId = `buyer-${nanoid(8)}`;
    db.prepare(`INSERT INTO buyers (id, user_id, name, buyer_type, location, verified) VALUES (?, ?, ?, 'Wholesaler', 'Andhra Pradesh', 1)`).run(buyerId, newUserId, displayName);
    profile = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(buyerId);
  }

  const createdUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(newUserId);
  const token = generateToken(createdUser.id, createdUser.role);
  const { password: _pw, ...safeUser } = createdUser;

  res.status(201).json({ user: safeUser, profile, token, isNewUser: true });
});

export default router;
