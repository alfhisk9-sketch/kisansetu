/**
 * KisanSetu Authoritative Market Data Synchronization CLI Script
 * 
 * Ingests, validates, deduplicates, and synchronizes official Government of India
 * market arrival data (data.gov.in / AGMARKNET) into Supabase PostgreSQL.
 * 
 * Run with:
 * npm run market-data:sync
 * or:
 * node server/scripts/syncMarketData.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

export async function runMarketDataSyncCli() {
  console.log("==================================================");
  console.log("KisanSetu Official Market Data Synchronization");
  console.log("Source Authority: Government of India (data.gov.in / AGMARKNET)");
  console.log("==================================================");

  try {
    const result = await syncMarketData({ trigger: "cli" });

    console.log("Synchronization Execution Completed:");
    console.log(`- Status:           ${result.status}`);
    console.log(`- Source:           ${result.source}`);
    console.log(`- Records Fetched:  ${result.recordsFetched}`);
    console.log(`- Records Inserted: ${result.recordsInserted}`);
    console.log(`- Records Updated:  ${result.recordsUpdated}`);
    console.log(`- Records Rejected: ${result.recordsRejected}`);
    console.log(`- Supabase Status:  ${result.supabaseStatus}`);

    const syncStatus = await getLatestSyncStatus();
    console.log(`- Total Market Prices:    ${syncStatus?.metrics?.totalPrices || 0}`);
    console.log(`- Total Verified Mandis:  ${syncStatus?.metrics?.totalMandis || 0}`);
    console.log(`- Total Storage Hubs:     ${syncStatus?.metrics?.totalStorage || 0}`);
    console.log("==================================================");
    return result;
  } catch (err) {
    console.error("[Market Data Sync Failed]:", err.message);
    throw err;
  }
}

// Execute if run directly from CLI
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  runMarketDataSyncCli()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
