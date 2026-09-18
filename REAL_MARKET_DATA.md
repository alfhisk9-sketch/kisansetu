# KisanSetu — Real Indian Agricultural Market Data Integration

This document outlines the architecture, data sources, ingestion pipeline, validation rules, deduplication strategy, and provenance indicators for official Indian agricultural market prices in KisanSetu.

---

## 1. Authoritative Data Sources

KisanSetu enforces a strict **no-fabrication** policy. Fabricated, random numbers are completely eliminated.

### Primary Source:
- **Source**: Government of India Open Government Data (OGD) Platform / [data.gov.in](https://data.gov.in/)
- **Dataset**: *Current Daily Price of Various Commodities from Various Markets (Mandi)*
- **Originating Body**: AGMARKNET (Directorate of Marketing & Inspection, Ministry of Agriculture & Farmers Welfare, GoI)
- **Data Points**:
  - `min_price` (Minimum wholesale mandi price in ₹/quintal)
  - `modal_price` (Most frequent / modal wholesale transaction price in ₹/quintal)
  - `max_price` (Maximum wholesale mandi price in ₹/quintal)
  - `arrival_quantity` (Daily arrivals recorded in quintals)
  - `arrival_date` (Observation date)

### Secondary / Validation Sources:
- **e-NAM** (National Agriculture Market) mandi bulletins
- **State APMC Portals** (Andhra Pradesh Marketing Department, MSAMB Maharashtra, Karnataka RSAMB)

---

## 2. Ingestion Pipeline Architecture

Government market data APIs are **never called directly from browser client code**. Instead, a robust server-side ingestion service handles retrieval, validation, and database upserts.

```
Government Data Source (data.gov.in / AGMARKNET API)
                 ↓
      Server Ingestion Service
   (server/services/marketDataService.js)
                 ↓
   Validation & Normalization Engine
   - min_price <= modal_price <= max_price
   - Deduplication via UNIQUE (market, crop, date)
                 ↓
   Supabase PostgreSQL / Local SQLite DB
   (market_prices, mandis, crops)
                 ↓
   KisanSetu Express API (/api/markets, /api/markets/compare)
                 ↓
      React UI (Market Intelligence & Map)
```

---

## 3. Data Validation & Integrity Rules

Before any incoming record is inserted into the database, it must pass strict mathematical and structural constraints:

1. **Market & Commodity Verification**: The market must resolve to an active APMC yard or registered mandi.
2. **Price Sanity**:
   $$\text{min\_price} \le \text{modal\_price} \le \text{max\_price}$$
   - Prices must be positive ($> 0$).
   - Negative or zero price records are strictly rejected.
3. **Unit Normalization**: All prices are standardized to **₹ per quintal** (1 quintal = 100 kg).
4. **Missing Values**: Missing or null modal prices are rejected; missing prices are never fabricated or guessed.
5. **Deduplication**: Running sync jobs repeatedly uses `UPSERT` semantics on `(market_id, crop_id, date)` so that duplicate daily rows are never created.

---

## 4. Provenance & Freshness Badges

Every price item and market entry in KisanSetu displays clear data provenance:

| Badge | Meaning | Display Criteria |
|---|---|---|
| `LIVE` | Genuine real-time data received today | Only when verified arrival timestamp matches today's date |
| `LATEST AVAILABLE` | Authoritative official data from latest reported session | Normal verified AGMARKNET mandi data |
| `HISTORICAL` | Past trading sessions used for 7-day or 30-day price trends | Date is older than 3 days |
| `SEEDED DEMO` | Reference test facility clearly demarcated | Demo cold storage or test facilities only |

The UI displays:
- **Source:** *Government of India / AGMARKNET / data.gov.in*
- **Updated on:** *<Formatted Date>*

---

## 5. Running Synchronization

### Via CLI Command:
```bash
# Fetch latest verified data, validate, and upsert
npm run market-data:sync

# Seed verified baseline APMC mandis & initial records
npm run market-data:seed
```

### Via Admin Dashboard:
Authorized administrators can trigger sync via the KisanSetu Admin Dashboard (`/admin`), which invokes:
```
POST /api/admin/market-data/sync
```
The sync response returns:
- Records fetched
- Records inserted
- Records updated
- Records rejected
- Source timestamp
