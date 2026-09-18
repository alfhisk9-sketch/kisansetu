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

/**
 * Generate a cryptographically random session token
 */
export function generateToken(userId, role) {
  const payload = Buffer.from(JSON.stringify({ userId, role, ts: Date.now() })).toString("base64url");
  const sig = crypto.randomBytes(24).toString("base64url");
  return `ks_${payload}.${sig}`;
}
