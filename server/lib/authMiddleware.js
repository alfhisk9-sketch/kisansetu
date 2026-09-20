import { getSupabaseAdmin } from "./supabase.js";
import { isOfflineDev, getDb } from "../db.js";
import { verifyToken } from "./security.js";

/**
 * Extract authenticated user from request header (supports async Supabase query in production)
 */
export async function getRequestUser(req) {
  const authHeader = req.headers["x-user-id"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!authHeader) return null;

  try {
    let resolvedUserId = authHeader;
    let tokenRole = null;

    // Decode and verify token if prefixed with ks_
    if (typeof authHeader === "string" && authHeader.startsWith("ks_")) {
      const decoded = verifyToken(authHeader);
      if (!decoded || !decoded.userId) {
        return null;
      }
      resolvedUserId = decoded.userId;
      tokenRole = decoded.role;
    }

    const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
    const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (isProduction || hasSupabaseConfig) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: userRow, error } = await supabase
          .from("users")
          .select("id, username, role, display_name")
          .eq("id", resolvedUserId)
          .maybeSingle();

        if (!error && userRow) {
          return userRow;
        }
      }
      // In production, Supabase PostgreSQL is the strict source of truth
      if (isProduction) return null;
    }

    // SQLite mode (local/offline development only)
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
