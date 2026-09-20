import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production mode, Supabase PostgreSQL is the authoritative cloud database.
// Do not seed or touch local SQLite in production.
const isProduction = process.env.NODE_ENV === "production" || process.env.ALLOW_OFFLINE_DEV !== "true";
if (isProduction) {
  console.log("Production mode detected — Supabase PostgreSQL is active. Skipping local SQLite seed.");
  process.exit(0);
}

// Local / Offline Development Seeding
const { db, initSchema, closeDb } = await import("./db.js");

initSchema();

const row = db.prepare(`SELECT COUNT(*) AS c FROM users`).get();
const isEmpty = !row || row.c === 0;

if (isEmpty) {
  console.log("Local SQLite database is empty — running full seed...");
  closeDb();
  execSync("node seed.js", { stdio: "inherit", cwd: __dirname });
} else {
  console.log(`Local SQLite database already has ${row.c} user(s) — skipping seed to preserve existing data.`);
  closeDb();
}
