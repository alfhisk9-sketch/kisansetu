import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initSchema } from "../db.js";
import { syncMarketData, getLatestSyncStatus } from "../services/marketDataService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load local .env files
const envCandidates = [
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env")
];
for (const envFile of envCandidates) {
  if (fs.existsSync(envFile)) {
    try {
      if (typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
    } catch (_) {}
  }
}

async function run() {
  console.log("==================================================");
  console.log("KisanSetu — Real Indian Agricultural Market Data Sync");
  console.log("Source: Government of India / AGMARKNET");
  console.log("==================================================");

  initSchema();

  console.log("Ingesting and validating verified APMC mandi arrivals...");
  const result = await syncMarketData({ trigger: "cli_job" });

  console.log("Sync Execution Finished:");
  console.log(`- Status:           ${result.status}`);
  console.log(`- Source:           ${result.source}`);
  console.log(`- Records Fetched:  ${result.recordsFetched}`);
  console.log(`- Records Inserted: ${result.recordsInserted}`);
  console.log(`- Records Updated:  ${result.recordsUpdated}`);
  console.log(`- Records Rejected: ${result.recordsRejected}`);
  console.log(`- Supabase Sync:    ${result.supabaseStatus}`);

  const status = getLatestSyncStatus();
  console.log(`- Total Market Prices in System: ${status.metrics.totalPrices}`);
  console.log(`- Total Verified Mandis:         ${status.metrics.totalMandis}`);
  console.log(`- Total Storage Facilities:      ${status.metrics.totalStorage}`);
  console.log("==================================================");
}

run().catch(err => {
  console.error("Market Data Sync failed:", err);
  process.exit(1);
});
