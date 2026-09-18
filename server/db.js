import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "krishisetu.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema() {
  db.exec(`
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
  `);
}
