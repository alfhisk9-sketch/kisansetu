import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { assertRequired } from "../lib/validate.js";
import { hashPassword, verifyPassword, generateToken } from "../lib/security.js";

const router = Router();

// Production-grade authentication with password hashing & session token support
router.post("/login", (req, res) => {
  if (!assertRequired(req, res, ["username", "password"])) return;
  const { username, password } = req.body;

  // Support case-insensitive username lookup
  const user = db.prepare(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`).get(username);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const isValid = verifyPassword(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Automatic seamless security upgrade: if legacy plaintext was stored, hash it now
  if (!user.password.includes(":")) {
    try {
      const secureHash = hashPassword(password);
      db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(secureHash, user.id);
    } catch (err) {
      console.warn("Failed to upgrade password hash:", err.message);
    }
  }

  let profile = null;
  if (user.role === "farmer") profile = db.prepare(`SELECT * FROM farmers WHERE user_id = ?`).get(user.id);
  if (user.role === "fpo") profile = db.prepare(`SELECT * FROM fpos WHERE user_id = ?`).get(user.id);
  if (user.role === "buyer") profile = db.prepare(`SELECT * FROM buyers WHERE user_id = ?`).get(user.id);

  const token = generateToken(user.id, user.role);
  const { password: _pw, ...safeUser } = user;
  res.json({ user: safeUser, profile, token });
});

// Self-registration with secure password hashing
const REGISTERABLE_ROLES = ["farmer", "fpo", "buyer"];
const BUYER_TYPES = ["Processor", "Wholesaler", "Retail chain", "Institutional buyer", "Exporter", "Digital trader"];

router.post("/register", (req, res) => {
  if (!assertRequired(req, res, ["username", "password", "confirmPassword", "role", "displayName", "phone", "location"])) return;
  const { username, password, confirmPassword, role, displayName, phone, location } = req.body;

  if (!REGISTERABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: "role must be one of: farmer, fpo, buyer" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "password and confirmation do not match" });
  }
  if (role === "buyer" && !BUYER_TYPES.includes(req.body.buyerType)) {
    return res.status(400).json({ error: `buyerType must be one of: ${BUYER_TYPES.join(", ")}` });
  }

  const existing = db.prepare(`SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)`).get(username);
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const userId = `user-${nanoid(10)}`;
  const securePassword = hashPassword(password);

  const createAccount = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, username, password, role, display_name, phone, location) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, username, securePassword, role, displayName, phone, location);

    let profile = null;
    if (role === "farmer") {
      const farmerId = `farmer-${nanoid(10)}`;
      db.prepare(
        `INSERT INTO farmers (id, user_id, name, village, district, fpo_id, land_holding_acres, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(farmerId, userId, displayName, req.body.village || null, req.body.district || null, null, req.body.landHoldingAcres || null, phone);
      profile = db.prepare(`SELECT * FROM farmers WHERE id = ?`).get(farmerId);
    } else if (role === "fpo") {
      const fpoId = `fpo-${nanoid(10)}`;
      db.prepare(
        `INSERT INTO fpos (id, user_id, name, district, registration_no, member_count, contact) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(fpoId, userId, displayName, req.body.district || null, req.body.registrationNo || null, req.body.memberCount || 0, phone);
      profile = db.prepare(`SELECT * FROM fpos WHERE id = ?`).get(fpoId);
    } else if (role === "buyer") {
      const buyerId = `buyer-${nanoid(10)}`;
      db.prepare(
        `INSERT INTO buyers (id, user_id, name, buyer_type, location, verified, documents_verified, transactions_completed, payment_reliability_pct, response_rate_pct, contact)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`
      ).run(buyerId, userId, displayName, req.body.buyerType, location, phone);
      profile = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(buyerId);
    }
    return profile;
  });

  let profile;
  try {
    profile = createAccount();
  } catch (e) {
    console.error("Registration failed:", e);
    return res.status(500).json({ error: "Registration failed" });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const token = generateToken(userId, role);
  const { password: _pw, ...safeUser } = user;
  res.status(201).json({ user: safeUser, profile, token });
});

router.get("/demo-accounts", (req, res) => {
  res.json({
    note: "Demo credentials for reviewers and judges. Password is 'demo123' for all accounts.",
    accounts: [
      { role: "farmer", username: "shaik.rabbani", name: "Shaik Rabbani (Farmer)" },
      { role: "farmer", username: "shaik.alfhi", name: "Shaik Alfhi (Farmer)" },
      { role: "fpo", username: "koushik", name: "Koushik (FPO Lead)" },
      { role: "buyer", username: "d.krishna", name: "D. Krishna (Verified Buyer)" },
      { role: "buyer", username: "akshay", name: "Akshay (Digital Trader)" },
      { role: "admin", username: "hemasri", name: "Hemasri (Platform Admin)" },
    ],
  });
});

router.patch("/profile", (req, res) => {
  if (!assertRequired(req, res, ["userId"])) return;
  const { userId, displayName, phone, location } = req.body;

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

router.post("/change-password", (req, res) => {
  if (!assertRequired(req, res, ["userId", "currentPassword", "newPassword", "confirmNewPassword"])) return;
  const { userId, currentPassword, newPassword, confirmNewPassword } = req.body;

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: "unknown userId" });
  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: "New password and confirmation do not match" });
  }

  const securePassword = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(securePassword, userId);
  res.json({ ok: true, message: "Password updated successfully" });
});

export default router;
