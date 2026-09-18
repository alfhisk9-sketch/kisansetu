import { execSync } from "child_process";
import { db, initSchema } from "./db.js";

// Ensures tables exist, then only runs the full (destructive) seed if the
// database is genuinely empty. This lets a Render deploy with a persistent
// disk keep real data (e.g. accounts created via /api/auth/register)
// across restarts, instead of wiping it back to demo data every boot —
// while a fresh/empty disk still gets seeded automatically on first run.
initSchema();

const row = db.prepare(`SELECT COUNT(*) AS c FROM users`).get();
const isEmpty = row.c === 0;

db.close();

if (isEmpty) {
  console.log("Database is empty — running full seed...");
  execSync("node seed.js", { stdio: "inherit", cwd: new URL(".", import.meta.url).pathname });
} else {
  console.log(`Database already has ${row.c} user(s) — skipping seed to preserve existing data.`);
}
