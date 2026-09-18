import { db, initSchema } from "./db.js";
import { nanoid } from "nanoid";
import { DISTRICT_DISTANCES } from "./data/distances.js";
import { computeGrade } from "./lib/algorithms.js";

// ---- deterministic seeded RNG so demo data is stable across re-seeds ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const id = (prefix) => `${prefix}-${nanoid(8)}`;

console.log("Resetting schema...");
db.exec(`
  DROP TABLE IF EXISTS notifications; DROP TABLE IF EXISTS grievances; DROP TABLE IF EXISTS payments;
  DROP TABLE IF EXISTS logistics; DROP TABLE IF EXISTS transactions; DROP TABLE IF EXISTS offers;
  DROP TABLE IF EXISTS buyer_demands; DROP TABLE IF EXISTS quality_grades; DROP TABLE IF EXISTS lots;
  DROP TABLE IF EXISTS storage_facilities; DROP TABLE IF EXISTS market_prices; DROP TABLE IF EXISTS markets;
  DROP TABLE IF EXISTS crops; DROP TABLE IF EXISTS buyers; DROP TABLE IF EXISTS fpos; DROP TABLE IF EXISTS farmers;
  DROP TABLE IF EXISTS users;
`);
initSchema();

// ---------------- USERS (demo credentials) ----------------
const insUser = db.prepare(`INSERT INTO users (id, username, password, role, display_name, phone, location) VALUES (?,?,?,?,?,?,?)`);

const demoUsers = [
  { id: "user-farmer1", username: "shaik.rabbani", role: "farmer", display_name: "Shaik Rabbani", phone: "9440010001", location: "Duggirala, Guntur" },
  { id: "user-farmer2", username: "shaik.alfhi", role: "farmer", display_name: "Shaik Alfhi", phone: "9440010002", location: "Tenali, Guntur" },
  { id: "user-fpo1", username: "koushik", role: "fpo", display_name: "Koushik", phone: "9440010010", location: "Guntur" },
  { id: "user-buyer1", username: "d.krishna", role: "buyer", display_name: "D. Krishna", phone: "9440010020", location: "Vijayawada" },
  { id: "user-buyer2", username: "akshay", role: "buyer", display_name: "Akshay", phone: "9440010021", location: "Visakhapatnam" },
  { id: "user-admin1", username: "hemasri", role: "admin", display_name: "Hemasri", phone: "9440010099", location: "Vijayawada" },
];
for (const u of demoUsers) insUser.run(u.id, u.username, "demo123", u.role, u.display_name, u.phone, u.location);

// ---------------- CROPS ----------------
const cropsList = [
  { id: "crop-onion", name: "Onion", category: "Vegetable" },
  { id: "crop-tomato", name: "Tomato", category: "Vegetable" },
  { id: "crop-soybean", name: "Soybean", category: "Oilseed" },
  { id: "crop-cotton", name: "Cotton", category: "Fibre" },
  { id: "crop-grapes", name: "Grapes", category: "Fruit" },
  { id: "crop-pomegranate", name: "Pomegranate", category: "Fruit" },
  { id: "crop-wheat", name: "Wheat", category: "Cereal" },
  { id: "crop-maize", name: "Maize", category: "Cereal" },
];
const insCrop = db.prepare(`INSERT INTO crops (id, name, unit, category) VALUES (?,?,?,?)`);
for (const c of cropsList) insCrop.run(c.id, c.name, "quintal", c.category);

// ---------------- MARKETS ----------------
const marketsList = [
  { id: "mkt-lasalgaon", name: "Guntur APMC Yard", district: "Guntur" },
  { id: "mkt-pimpalgaon", name: "Kurnool APMC Yard", district: "Kurnool" },
  { id: "mkt-manmad", name: "Anantapur APMC Yard", district: "Anantapur" },
  { id: "mkt-pune", name: "Vijayawada APMC Yard", district: "Krishna" },
  { id: "mkt-solapur", name: "Nellore APMC Yard", district: "Nellore" },
  { id: "mkt-sangli", name: "Chittoor APMC Yard", district: "Chittoor" },
  { id: "mkt-kolhapur", name: "Kadapa APMC Yard", district: "Kadapa" },
  { id: "mkt-nagpur", name: "Visakhapatnam APMC Yard", district: "Visakhapatnam" },
  { id: "mkt-ahilyanagar", name: "Eluru APMC Yard", district: "West Godavari" },
  { id: "mkt-aurangabad", name: "Kakinada APMC Yard", district: "East Godavari" },
];
const insMarket = db.prepare(`INSERT INTO markets (id, name, district, lat, lng) VALUES (?,?,?,?,?)`);
for (const m of marketsList) insMarket.run(m.id, m.name, m.district, null, null);

// Base modal prices per crop (₹/quintal), realistic ballpark for the demo
const basePriceByCrop = {
  "crop-onion": 2650,
  "crop-tomato": 1400,
  "crop-soybean": 4350,
  "crop-cotton": 7100,
  "crop-grapes": 5200,
  "crop-pomegranate": 8600,
  "crop-wheat": 2450,
  "crop-maize": 2050,
};
// Which markets primarily trade which crops (keeps dataset realistic, not every crop everywhere)
const marketCropMap = {
  "mkt-lasalgaon": ["crop-onion", "crop-wheat"],
  "mkt-pimpalgaon": ["crop-onion", "crop-grapes"],
  "mkt-manmad": ["crop-onion", "crop-maize"],
  "mkt-pune": ["crop-tomato", "crop-onion", "crop-grapes"],
  "mkt-solapur": ["crop-pomegranate", "crop-cotton", "crop-soybean"],
  "mkt-sangli": ["crop-grapes", "crop-soybean", "crop-tomato"],
  "mkt-kolhapur": ["crop-sugarcane_placeholder", "crop-soybean", "crop-maize"].filter((c) => cropsList.some((cr) => cr.id === c)),
  "mkt-nagpur": ["crop-cotton", "crop-soybean", "crop-wheat"],
  "mkt-ahilyanagar": ["crop-onion", "crop-pomegranate", "crop-cotton"],
  "mkt-aurangabad": ["crop-cotton", "crop-maize", "crop-soybean"],
};

// ---------------- MARKET PRICES (last 30 days, deterministic pseudo-trend) ----------------
const insPrice = db.prepare(`INSERT INTO market_prices (id, market_id, crop_id, date, min_price, max_price, modal_price, arrival_qty_quintals) VALUES (?,?,?,?,?,?,?,?)`);
const today = new Date();
for (const [marketId, crops] of Object.entries(marketCropMap)) {
  for (const cropId of crops) {
    const base = basePriceByCrop[cropId];
    if (!base) continue;
    // Random gentle trend direction + market-specific offset so markets differ
    const marketOffsetPct = (rand() - 0.5) * 0.08; // +/-4%
    const trendPerDay = (rand() - 0.45) * 6; // slight upward bias overall
    let runningModal = base * (1 + marketOffsetPct);
    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const noise = (rand() - 0.5) * base * 0.02;
      runningModal = runningModal + trendPerDay + noise;
      const modal = Math.max(300, Math.round(runningModal));
      const min = Math.round(modal * (0.92 - rand() * 0.03));
      const max = Math.round(modal * (1.05 + rand() * 0.04));
      const arrival = Math.round(200 + rand() * 1800);
      insPrice.run(id("price"), marketId, cropId, d.toISOString().slice(0, 10), min, max, modal, arrival);
    }
  }
}

// ---------------- FARMERS ----------------
const insFarmer = db.prepare(`INSERT INTO farmers (id, user_id, name, village, district, fpo_id, land_holding_acres, phone) VALUES (?,?,?,?,?,?,?,?)`);
insFarmer.run("farmer-1", "user-farmer1", "Shaik Rabbani", "Duggirala", "Guntur", "fpo-1", 4.5, "9440010001");
insFarmer.run("farmer-2", "user-farmer2", "Shaik Alfhi", "Tenali", "Guntur", "fpo-1", 2.8, "9440010002");
const extraFarmerNames = [
  "Venkata Rao", "Koteswara Rao", "Subba Reddy", "Nageswara Rao", "Bhaskara Rao",
  "Appa Rao", "Sambasiva Rao", "Chinna Rao", "Ramana Murthy", "Siva Prasad",
];
for (let i = 0; i < extraFarmerNames.length; i++) {
  insFarmer.run(`farmer-extra-${i}`, null, extraFarmerNames[i], "Duggirala", "Guntur", "fpo-1", 1.5 + rand() * 5, `94400${11000 + i}`);
}

// ---------------- FPO ----------------
const insFpo = db.prepare(`INSERT INTO fpos (id, user_id, name, district, registration_no, member_count, contact) VALUES (?,?,?,?,?,?,?)`);
insFpo.run("fpo-1", "user-fpo1", "Guntur Farmers Producer Co. Ltd", "Guntur", "FPO/AP/2019/1042", 42, "9440010010");

// ---------------- BUYERS ----------------
const insBuyer = db.prepare(`INSERT INTO buyers (id, user_id, name, buyer_type, location, verified, documents_verified, transactions_completed, payment_reliability_pct, response_rate_pct, contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const buyersList = [
  { id: "buyer-1", user_id: "user-buyer1", name: "D. Krishna Agri Traders", type: "Processor", location: "Vijayawada", verified: 1, docs: 1, txns: 58, pay: 96, resp: 91 },
  { id: "buyer-2", user_id: "user-buyer2", name: "Akshay Retail Foods", type: "Retail chain", location: "Visakhapatnam", verified: 1, docs: 1, txns: 34, pay: 89, resp: 84 },
  { id: "buyer-3", user_id: null, name: "Sri Venkateswara Exports LLP", type: "Exporter", location: "Guntur", verified: 1, docs: 1, txns: 21, pay: 93, resp: 78 },
  { id: "buyer-4", user_id: null, name: "Rayalaseema Wholesale Traders", type: "Wholesaler", location: "Kurnool", verified: 1, docs: 0, txns: 12, pay: 81, resp: 70 },
  { id: "buyer-5", user_id: null, name: "AP AgriBazaar Digital Trading", type: "Digital trader", location: "Vijayawada", verified: 1, docs: 1, txns: 145, pay: 97, resp: 95 },
  { id: "buyer-6", user_id: null, name: "Godavari Institutional Supplies", type: "Institutional buyer", location: "Kakinada", verified: 0, docs: 0, txns: 4, pay: 75, resp: 60 },
];
for (const b of buyersList) insBuyer.run(b.id, b.user_id, b.name, b.type, b.location, b.verified, b.docs, b.txns, b.pay, b.resp, "+91-98xxxxxxx" + b.id.slice(-2));

// ---------------- STORAGE FACILITIES ----------------
const insStorage = db.prepare(`INSERT INTO storage_facilities (id, name, location, district, capacity_quintals, available_capacity_quintals, cost_per_day_per_quintal, crop_suitability, contact, verified, latitude, longitude, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const storageList = [
  { id: "store-1", name: "Guntur District Warehousing Corp - Duggirala", location: "Duggirala", district: "Guntur", cap: 5000, avail: 1800, cost: 1.2, crops: "Onion,Wheat,Maize", lat: 16.3262, lng: 80.6278 },
  { id: "store-2", name: "Tenali Cold Storage & Godown", location: "Tenali", district: "Guntur", cap: 3000, avail: 900, cost: 1.5, crops: "Onion,Grapes", lat: 16.2435, lng: 80.6400 },
  { id: "store-3", name: "Vijayawada Rural Godown Facility", location: "Vijayawada", district: "Krishna", cap: 4000, avail: 2200, cost: 1.1, crops: "Tomato,Onion,Soybean", lat: 16.5160, lng: 80.6300 },
  { id: "store-4", name: "Nellore APMC Warehouse", location: "Nellore", district: "Nellore", cap: 6000, avail: 3100, cost: 0.95, crops: "Pomegranate,Cotton,Soybean", lat: 14.4426, lng: 79.9865 },
];
for (const s of storageList) insStorage.run(s.id, s.name, s.location, s.district, s.cap, s.avail, s.cost, s.crops, "APMC Office", 0, s.lat, s.lng, "SEEDED / DEMO");


// ---------------- LOTS ----------------
const insLot = db.prepare(`INSERT INTO lots (id, owner_type, owner_id, crop_id, variety, quantity_quintals, grade, location, district, harvest_date, available_from, expected_price, min_acceptable_price, storage_available, status, is_aggregated, source_lot_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoDaysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

insLot.run("LOT-2026-0031", "farmer", "farmer-1", "crop-onion", "Bellary Red", 18, "A", "Duggirala", "Guntur", isoDaysAgo(6), isoDaysAgo(2), 2900, 2600, 1, "Open for offers", 0, null);
insLot.run("LOT-2026-0032", "farmer", "farmer-2", "crop-onion", "Bellary Red", 12, "B", "Tenali", "Guntur", isoDaysAgo(4), isoDaysAgo(1), 2650, 2400, 0, "Open for offers", 0, null);
insLot.run("LOT-2026-0033", "farmer", "farmer-1", "crop-grapes", "Thompson Seedless", 6, "A", "Duggirala", "Guntur", isoDaysAgo(2), isoDaysAgo(1), 5400, 5000, 1, "Under negotiation", 0, null);
insLot.run("LOT-2026-0048", "fpo", "fpo-1", "crop-onion", "Bellary Red", 120, "A", "Duggirala", "Guntur", isoDaysAgo(5), isoDaysAgo(2), 3000, 2750, 1, "Open for offers", 1, JSON.stringify(["LOT-2026-0031", "LOT-2026-0032"]));
insLot.run("LOT-2026-0050", "farmer", "farmer-extra-0", "crop-soybean", "JS-335", 25, "B", "Duggirala", "Guntur", isoDaysAgo(10), isoDaysAgo(5), 4300, 4000, 0, "Sold", 0, null);

// ---------------- QUALITY GRADES ----------------
const insGrade = db.prepare(`INSERT INTO quality_grades (id, lot_id, grade, size_rating, moisture_rating, damage_pct, foreign_material_pct, appearance_rating, verified_by, verified, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const gradeInputs = [
  { lot: "LOT-2026-0031", size: "Good", moisture: "Acceptable", damage: 3, fm: 1.5, appearance: "Good" },
  { lot: "LOT-2026-0032", size: "Average", moisture: "Acceptable", damage: 6, fm: 3, appearance: "Average" },
  { lot: "LOT-2026-0048", size: "Good", moisture: "Good", damage: 2, fm: 1, appearance: "Good" },
];
for (const g of gradeInputs) {
  const grade = computeGrade({ sizeRating: g.size, moistureRating: g.moisture, damagePct: g.damage, foreignMaterialPct: g.fm, appearanceRating: g.appearance });
  insGrade.run(id("qg"), g.lot, grade, g.size, g.moisture, g.damage, g.fm, g.appearance, "FPO Field Officer", 1, "Assessed at aggregation point");
}

// ---------------- BUYER DEMANDS ----------------
const insDemand = db.prepare(`INSERT INTO buyer_demands (id, buyer_id, crop_id, quantity_quintals, grade_required, required_by, offer_price, location, status) VALUES (?,?,?,?,?,?,?,?,?)`);
insDemand.run("DEM-1001", "buyer-1", "crop-onion", 100, "A", isoDaysFromNow(10), 3050, "Vijayawada", "Open");
insDemand.run("DEM-1002", "buyer-5", "crop-onion", 50, "B", isoDaysFromNow(7), 2700, "Vijayawada", "Open");
insDemand.run("DEM-1003", "buyer-2", "crop-tomato", 500, "A", isoDaysFromNow(14), 2900, "Visakhapatnam", "Open");
insDemand.run("DEM-1004", "buyer-3", "crop-grapes", 40, "A", isoDaysFromNow(5), 5600, "Guntur", "Open");
insDemand.run("DEM-1005", "buyer-4", "crop-onion", 20, "C", isoDaysFromNow(3), 2300, "Nellore", "Open");

// ---------------- OFFERS ----------------
const insOffer = db.prepare(`INSERT INTO offers (id, lot_id, buyer_id, offer_price, quantity_quintals, delivery_date, payment_terms, expiry_date, status, counter_of) VALUES (?,?,?,?,?,?,?,?,?,?)`);
insOffer.run("OFR-2001", "LOT-2026-0031", "buyer-1", 3080, 18, isoDaysFromNow(4), "Within 48 hours of delivery", isoDaysFromNow(2), "Pending", null);
insOffer.run("OFR-2002", "LOT-2026-0048", "buyer-5", 3020, 120, isoDaysFromNow(6), "7-day credit", isoDaysFromNow(3), "Pending", null);
insOffer.run("OFR-2003", "LOT-2026-0033", "buyer-3", 5300, 6, isoDaysFromNow(3), "Advance 20%, balance on delivery", isoDaysFromNow(1), "Countered", null);
insOffer.run("OFR-2004", "LOT-2026-0033", "buyer-3", 5450, 6, isoDaysFromNow(3), "Advance 20%, balance on delivery", isoDaysFromNow(2), "Pending", "OFR-2003");
insOffer.run("OFR-2005", "LOT-2026-0050", "buyer-4", 4280, 25, isoDaysAgo(3), "Cash on delivery", isoDaysAgo(4), "Accepted", null);

// ---------------- TRANSACTIONS ----------------
const insTxn = db.prepare(`INSERT INTO transactions (id, lot_id, offer_id, farmer_or_fpo_id, buyer_id, quantity_quintals, agreed_price, total_amount, stage) VALUES (?,?,?,?,?,?,?,?,?)`);
insTxn.run("TXN-3001", "LOT-2026-0050", "OFR-2005", "farmer-extra-0", "buyer-4", 25, 4280, 25 * 4280, "Payment Received");
insTxn.run("TXN-3002", "LOT-2026-0032", null, "farmer-2", "buyer-4", 12, 2680, 12 * 2680, "Goods Delivered");

// ---------------- LOGISTICS ----------------
const insLogi = db.prepare(`INSERT INTO logistics (id, transaction_id, pickup_location, destination, quantity_quintals, distance_km, transport_cost, vehicle_requirement, pickup_date, delivery_date, status, vehicle_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
insLogi.run("LOG-4001", "TXN-3001", "Duggirala, Guntur", "Nellore", 25, 200, 200 * 1.05, "Open truck 6-tonne", isoDaysAgo(4), isoDaysAgo(3), "Delivered", "AP07-AB-4521");
insLogi.run("LOG-4002", "TXN-3002", "Tenali, Guntur", "Nellore", 12, 200, 200 * 1.05, "Open truck 6-tonne", isoDaysAgo(2), isoDaysAgo(1), "Delivered", "AP07-CD-7788");

// ---------------- PAYMENTS ----------------
const insPay = db.prepare(`INSERT INTO payments (id, transaction_id, amount, buyer_id, payee_id, date, method, status) VALUES (?,?,?,?,?,?,?,?)`);
insPay.run("PAY-5001", "TXN-3001", 25 * 4280, "buyer-4", "farmer-extra-0", isoDaysAgo(2), "Bank transfer (mock)", "Received");
insPay.run("PAY-5002", "TXN-3002", 12 * 2680, "buyer-4", "farmer-2", isoDaysAgo(0), "Bank transfer (mock)", "Initiated");

// ---------------- GRIEVANCES ----------------
const insGriev = db.prepare(`INSERT INTO grievances (id, transaction_id, raised_by, issue_category, description, evidence, status, resolution_notes) VALUES (?,?,?,?,?,?,?,?)`);
insGriev.run("GRV-6001", "TXN-3002", "farmer-2", "Payment delay", "Payment initiated but not yet received after 3 days despite 48-hour terms.", null, "Under Review", null);

// ---------------- NOTIFICATIONS ----------------
const insNotif = db.prepare(`INSERT INTO notifications (id, user_id, message, read) VALUES (?,?,?,?)`);
insNotif.run(id("notif"), "user-farmer1", "New offer received on LOT-2026-0031 from D. Krishna Agri Traders.", 0);
insNotif.run(id("notif"), "user-farmer2", "Your grievance GRV-6001 is now Under Review.", 0);
insNotif.run(id("notif"), "user-fpo1", "New offer received on LOT-2026-0048 from AP AgriBazaar Digital Trading.", 0);

console.log("Seed complete.");
console.log("Demo logins (password 'demo123' for all): shaik.rabbani, shaik.alfhi, koushik, d.krishna, akshay, hemasri");
