import crypto from "crypto";

/**
 * Hash password with salt using standard Node scrypt
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify password against stored hash or fallback to legacy plaintext
 */
export function verifyPassword(password, storedPassword) {
  if (!storedPassword || !password) return false;

  // Hashed format: salt:hash
  if (storedPassword.includes(":")) {
    const [salt, key] = storedPassword.split(":");
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  // Legacy plaintext fallback for demo seeds
  return password === storedPassword;
}

const SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "kisansetu_secure_token_secret_key_2026";

/**
 * Generate a cryptographically random session token
 */
export function generateToken(userId, role) {
  const payload = Buffer.from(JSON.stringify({ userId, role, ts: Date.now() })).toString("base64url");
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `ks_${payload}.${hmac}`;
}

/**
 * Verify session token and extract payload
 */
export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.startsWith("ks_")) return null;
  const raw = token.slice(3);
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedHmac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (sig !== expectedHmac) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}
