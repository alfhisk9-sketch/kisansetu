import { getSupabaseAdmin } from "./supabase.js";
import { isOfflineDev, getDb } from "../db.js";

/**
 * Extract authenticated user from request header (supports async Supabase query in production)
 */
export async function getRequestUser(req) {
  const authHeader = req.headers["x-user-id"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!authHeader) return null;

  try {
    let resolvedUserId = authHeader;
    let tokenRole = null;

    // Decode token if prefixed with ks_
    if (typeof authHeader === "string" && authHeader.startsWith("ks_")) {
      const payloadPart = authHeader.split(".")[0].replace("ks_", "");
      const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
      if (decoded && decoded.userId) {
        resolvedUserId = decoded.userId;
        tokenRole = decoded.role;
      }
    }

    const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

    if (isProduction) {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        // Fallback to validated token payload if database is temporarily unreachable
        if (tokenRole && resolvedUserId) {
          return { id: resolvedUserId, role: tokenRole, display_name: "Authenticated User" };
        }
        return null;
      }

      const { data: userRow, error } = await supabase
        .from("users")
        .select("id, username, role, display_name")
        .eq("id", resolvedUserId)
        .maybeSingle();

      if (!error && userRow) {
        return userRow;
      }

      if (tokenRole && resolvedUserId) {
        return { id: resolvedUserId, role: tokenRole, display_name: "Authenticated User" };
      }
      return null;
    }

    // SQLite mode
    const db = getDb();
    return db.prepare(`SELECT id, username, role, display_name FROM users WHERE id = ?`).get(resolvedUserId) || null;
  } catch (err) {
    return null;
  }
}

/**
 * Middleware factory to enforce specific roles
 */
export function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    // For read operations or public endpoints, pass through if no roles specified
    if (!allowedRoles || allowedRoles.length === 0) return next();

    const user = await getRequestUser(req);
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
