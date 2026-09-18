import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

// Load local environment files if present
const envCandidates = [
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", ".env"),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envPath);
      }
    } catch (_) {}
  }
}

import authRoutes from "./routes/auth.js";
import cropsRoutes from "./routes/crops.js";
import marketRoutes from "./routes/markets.js";
import lotsRoutes from "./routes/lots.js";
import buyersRoutes from "./routes/buyers.js";
import offersRoutes from "./routes/offers.js";
import transactionsRoutes from "./routes/transactions.js";
import fpoRoutes from "./routes/fpo.js";
import storageRoutes from "./routes/storage.js";
import grievancesRoutes from "./routes/grievances.js";
import adminRoutes from "./routes/admin.js";
import assistantRoutes from "./routes/assistant.js";
import notificationsRoutes from "./routes/notifications.js";
import forecastRoutes from "./routes/forecast.js";

// Initialize database schema
initSchema();

const app = express();

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

import { checkSupabaseHealth } from "./lib/supabase.js";

// Health checks (both root /health and /api/health for Render/monitoring)
const healthHandler = (req, res) => {
  res.json({
    status: "ok",
    service: "kisansetu-platform",
    version: "2.0.0",
    timestamp: new Date().toISOString()
  });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Strict Production Database Guard:
// In production (NODE_ENV=production), KisanSetu enforces that Supabase PostgreSQL is reachable.
// It will NEVER silently serve stale local SQLite fallback in production mode.
let _supabaseHealthyCached = null;
let _lastHealthCheck = 0;

app.use("/api", async (req, res, next) => {
  if (req.path === "/health") return next();

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  if (!isProduction) {
    return next();
  }

  const now = Date.now();
  if (_supabaseHealthyCached === null || (now - _lastHealthCheck > 15000)) {
    const health = await checkSupabaseHealth();
    _supabaseHealthyCached = (health.status === "healthy");
    _lastHealthCheck = now;
  }

  if (!_supabaseHealthyCached) {
    return res.status(503).json({
      error: "Production Database Unavailable",
      message: "KisanSetu is running in production mode (NODE_ENV=production). Supabase PostgreSQL must be configured and initialized. Please execute server/supabase-schema.sql in the Supabase SQL Editor.",
      status: "database_uninitialized",
      mode: "supabase-postgres"
    });
  }

  next();
});

// API Route Mounts
app.use("/api/auth", authRoutes);
app.use("/api/crops", cropsRoutes);
app.use("/api/markets", marketRoutes);
app.use("/api/lots", lotsRoutes);
app.use("/api/buyers", buyersRoutes);
app.use("/api/offers", offersRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/fpo", fpoRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/grievances", grievancesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/forecast", forecastRoutes);

// Catch-all JSON 404 for unmatched API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Serve built frontend in production if dist exists
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Malformed JSON in request body" });
  }
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`KisanSetu Platform API running on http://localhost:${PORT}`));
