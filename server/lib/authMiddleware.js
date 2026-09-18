import { db } from "../db.js";

/**
 * Extract authenticated user from request header
 */
export function getRequestUser(req) {
  const userId = req.headers["x-user-id"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!userId) return null;

  try {
    // If it's a token ks_payload.sig
    if (typeof userId === "string" && userId.startsWith("ks_")) {
      const payloadPart = userId.split(".")[0].replace("ks_", "");
      const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
      if (decoded && decoded.userId) {
        return db.prepare(`SELECT id, username, role, display_name FROM users WHERE id = ?`).get(decoded.userId);
      }
    }
    // Direct userId fallback
    return db.prepare(`SELECT id, username, role, display_name FROM users WHERE id = ?`).get(userId);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware factory to enforce specific roles
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    // For read operations or public endpoints, pass through if no roles specified
    if (!allowedRoles || allowedRoles.length === 0) return next();

    const user = getRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: `Access denied. Role '${user.role}' is not authorized for this operation.`,
        code: "FORBIDDEN"
      });
    }

    req.user = user;
    next();
  };
}
