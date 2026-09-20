import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "krishisetu.db");

let _dbInstance = null;

export function isOfflineDev() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_OFFLINE_DEV === "false") {
    return false;
  }
  return process.env.ALLOW_OFFLINE_DEV === "true" || process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

export function closeDb() {
  if (_dbInstance) {
    try {
      _dbInstance.close();
    } catch (_) {}
    _dbInstance = null;
  }
}

export function getDb() {
  if (!isOfflineDev()) {
    throw new Error(
      "SQLite (better-sqlite3) cannot be accessed in production mode (NODE_ENV=production, ALLOW_OFFLINE_DEV=false). " +
      "All production operations must use Supabase PostgreSQL."
    );
  }
  if (!_dbInstance) {
    const Database = require("better-sqlite3");
    _dbInstance = new Database(DB_PATH);
    _dbInstance.pragma("journal_mode = WAL");
    _dbInstance.pragma("foreign_keys = ON");

    if (typeof process !== "undefined" && process.once) {
      process.once("beforeExit", () => {
        closeDb();
      });
    }
  }
  return _dbInstance;
}

export const db = new Proxy({}, {
  get(target, prop) {
    if (!isOfflineDev()) {
      return () => {
        throw new Error(
          "SQLite (better-sqlite3) cannot be accessed in production mode. " +
          "All production operations must use Supabase PostgreSQL."
        );
      };
    }
    const instance = getDb();
    const val = instance[prop];
    if (typeof val === "function") {
      return val.bind(instance);
    }
    return val;
  }
});

export function initSchema() {
  if (!isOfflineDev()) return;
  const database = getDb();
  database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('farmer','fpo','buyer','admin')),
    display_name TEXT NOT NULL,
    phone TEXT,
    location TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS farmers (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    village TEXT,
    district TEXT,
    fpo_id TEXT,
    land_holding_acres REAL,
    phone TEXT
  );

  CREATE TABLE IF NOT EXISTS fpos (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    district TEXT,
    registration_no TEXT,
    member_count INTEGER DEFAULT 0,
    contact TEXT
  );

  CREATE TABLE IF NOT EXISTS buyers (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    buyer_type TEXT CHECK(buyer_type IN ('Processor','Wholesaler','Retail chain','Institutional buyer','Exporter','Digital trader')),
    location TEXT,
    verified INTEGER DEFAULT 0,
    documents_verified INTEGER DEFAULT 0,
    transactions_completed INTEGER DEFAULT 0,
    payment_reliability_pct REAL DEFAULT 0,
    response_rate_pct REAL DEFAULT 0,
    contact TEXT
  );

  CREATE TABLE IF NOT EXISTS crops (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    unit TEXT DEFAULT 'quintal',
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    district TEXT,
    lat REAL,
    lng REAL
  );

  CREATE TABLE IF NOT EXISTS market_prices (
    id TEXT PRIMARY KEY,
    market_id TEXT REFERENCES markets(id),
    crop_id TEXT REFERENCES crops(id),
    date TEXT NOT NULL,
    min_price REAL,
    max_price REAL,
    modal_price REAL,
    arrival_qty_quintals REAL
  );

  CREATE TABLE IF NOT EXISTS quality_grades (
    id TEXT PRIMARY KEY,
    lot_id TEXT,
    grade TEXT CHECK(grade IN ('A','B','C')),
    size_rating TEXT,
    moisture_rating TEXT,
    damage_pct REAL,
    foreign_material_pct REAL,
    appearance_rating TEXT,
    verified_by TEXT,
    verified INTEGER DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY,
    owner_type TEXT CHECK(owner_type IN ('farmer','fpo')),
    owner_id TEXT NOT NULL,
    crop_id TEXT REFERENCES crops(id),
    variety TEXT,
    quantity_quintals REAL,
    grade TEXT,
    location TEXT,
    district TEXT,
    harvest_date TEXT,
    available_from TEXT,
    expected_price REAL,
    min_acceptable_price REAL,
    storage_available INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Open for offers' CHECK(status IN ('Open for offers','Under negotiation','Sold','Closed','Withdrawn')),
    is_aggregated INTEGER DEFAULT 0,
    source_lot_ids TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS buyer_demands (
    id TEXT PRIMARY KEY,
    buyer_id TEXT REFERENCES buyers(id),
    crop_id TEXT REFERENCES crops(id),
    quantity_quintals REAL,
    grade_required TEXT,
    required_by TEXT,
    offer_price REAL,
    location TEXT,
    status TEXT DEFAULT 'Open' CHECK(status IN ('Open','Fulfilled','Expired','Cancelled')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    lot_id TEXT REFERENCES lots(id),
    buyer_id TEXT REFERENCES buyers(id),
    offer_price REAL,
    quantity_quintals REAL,
    delivery_date TEXT,
    payment_terms TEXT,
    expiry_date TEXT,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Accepted','Rejected','Countered','Expired')),
    counter_of TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    lot_id TEXT REFERENCES lots(id),
    offer_id TEXT REFERENCES offers(id),
    farmer_or_fpo_id TEXT,
    buyer_id TEXT REFERENCES buyers(id),
    quantity_quintals REAL,
    agreed_price REAL,
    total_amount REAL,
    stage TEXT DEFAULT 'Deal Accepted' CHECK(stage IN ('Deal Accepted','Invoice Generated','Goods Dispatched','Goods Delivered','Payment Initiated','Payment Received')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logistics (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id),
    pickup_location TEXT,
    destination TEXT,
    quantity_quintals REAL,
    distance_km REAL,
    transport_cost REAL,
    vehicle_requirement TEXT,
    pickup_date TEXT,
    delivery_date TEXT,
    status TEXT DEFAULT 'Requested' CHECK(status IN ('Requested','Assigned','In Transit','Delivered')),
    vehicle_no TEXT
  );

  CREATE TABLE IF NOT EXISTS storage_facilities (
    id TEXT PRIMARY KEY,
    name TEXT,
    location TEXT,
    district TEXT,
    capacity_quintals REAL,
    available_capacity_quintals REAL,
    cost_per_day_per_quintal REAL,
    crop_suitability TEXT,
    contact TEXT,
    verified INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id),
    amount REAL,
    buyer_id TEXT,
    payee_id TEXT,
    date TEXT,
    method TEXT,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Initiated','Received','Delayed'))
  );

  CREATE TABLE IF NOT EXISTS grievances (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id),
    raised_by TEXT,
    issue_category TEXT CHECK(issue_category IN ('Quality dispute','Quantity dispute','Payment delay','Logistics issue','Buyer issue','Other')),
    description TEXT,
    evidence TEXT,
    status TEXT DEFAULT 'Submitted' CHECK(status IN ('Submitted','Under Review','Evidence Requested','Resolved','Rejected')),
    resolution_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    message TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS forecast_runs (
    id TEXT PRIMARY KEY,
    crop_id TEXT REFERENCES crops(id),
    market_id TEXT REFERENCES markets(id),
    horizon_days INTEGER,
    method TEXT,
    predicted_price REAL,
    mae REAL, rmse REAL, r2 REAL,
    trained_on_rows INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS market_data_sync_logs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_rejected INTEGER DEFAULT 0,
    details TEXT,
    synced_at TEXT DEFAULT (datetime('now'))
  );
  `);

  // Safe idempotent column addition helper
  const addColumn = (table, col, def) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
    } catch (_) {}
  };

  // Markets geolocation
  addColumn("markets", "state", "TEXT DEFAULT 'Andhra Pradesh'");
  addColumn("markets", "address", "TEXT");
  addColumn("markets", "pincode", "TEXT");
  addColumn("markets", "location_source", "TEXT DEFAULT 'verified_apmc'");
  addColumn("markets", "status", "TEXT DEFAULT 'active'");

  // Storage facilities geolocation & metadata
  addColumn("storage_facilities", "type", "TEXT DEFAULT 'Cold Storage'");
  addColumn("storage_facilities", "state", "TEXT DEFAULT 'Andhra Pradesh'");
  addColumn("storage_facilities", "address", "TEXT");
  addColumn("storage_facilities", "pincode", "TEXT");
  addColumn("storage_facilities", "latitude", "REAL");
  addColumn("storage_facilities", "longitude", "REAL");
  addColumn("storage_facilities", "temperature_controlled", "INTEGER DEFAULT 1");
  addColumn("storage_facilities", "source", "TEXT DEFAULT 'SEEDED / DEMO'");
  addColumn("storage_facilities", "updated_at", "TEXT");

  // Market prices provenance
  addColumn("market_prices", "commodity", "TEXT");
  addColumn("market_prices", "variety", "TEXT DEFAULT 'FAQ'");
  addColumn("market_prices", "state", "TEXT DEFAULT 'Andhra Pradesh'");
  addColumn("market_prices", "district", "TEXT");
  addColumn("market_prices", "market", "TEXT");
  addColumn("market_prices", "unit", "TEXT DEFAULT 'quintal'");
  addColumn("market_prices", "source", "TEXT DEFAULT 'Government of India / AGMARKNET'");
  addColumn("market_prices", "source_url", "TEXT DEFAULT 'https://agmarknet.gov.in'");
  addColumn("market_prices", "source_record_id", "TEXT");
  addColumn("market_prices", "data_status", "TEXT DEFAULT 'LATEST AVAILABLE'");
  addColumn("market_prices", "observed_at", "TEXT");
  addColumn("market_prices", "updated_at", "TEXT");

  // Users OAuth fields
  addColumn("users", "auth_provider", "TEXT DEFAULT 'local'");
  addColumn("users", "supabase_user_id", "TEXT");
  addColumn("users", "avatar_url", "TEXT");
}
