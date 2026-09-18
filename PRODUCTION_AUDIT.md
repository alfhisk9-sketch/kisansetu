# KisanSetu — Comprehensive Production Audit Report

**Platform:** KisanSetu — Smart Agricultural Market Linkage & Price Discovery Platform  
**Smart India Hackathon 2026:** Problem Statement 26132  
**Audit Date:** September 18, 2026  
**Status:** Audit Completed & Verified

---

## 1. Existing System Architecture

KisanSetu is structured as a decoupled full-stack TypeScript/Node.js web application designed for high resilience across rural connectivity conditions:

- **Frontend Client:** React 18 with Vite, Tailwind CSS, Lucide Icons, Recharts, and React Router v6. Implements a responsive layout with desktop sidebar, tablet collapsible nav, and a 5-tab mobile bottom navigation (`Home`, `Markets`, `Sell`, `Offers`, `AI Saathi`).
- **Backend Server:** Node.js with Express v4, CORS, Morgan logging, security headers (nosniff, frameguard, xssFilter, referrerPolicy). Serves both the JSON REST API (`/api/*`) and production static assets with SPA routing fallback.
- **Offline / PWA Engine:** Progressive Web App with `manifest.webmanifest`, service worker caching for static assets, offline fallback indicator, and touch-optimized icons.
- **Internationalization (i18n):** Multi-language support across 4 languages: **English**, **Hindi (हिन्दी)**, **Marathi (मराठी)**, and **Telugu (తెలుగు)** with locale switcher in header and sidebar.

---

## 2. Existing Database Architecture

- **Dual-Mode Engine:**
  - **Local Development / Offline Mode:** SQLite (`server/data/krishisetu.db`) using `better-sqlite3` with Write-Ahead Logging (WAL) mode enabled for local performance and zero setup friction.
  - **Production PostgreSQL:** Supabase PostgreSQL with complete DDL schema definition in `server/supabase-schema.sql`.
- **Key Relational Tables:**
  1. `users` (id, username, password_hash, role, display_name, phone, location, auth_provider, supabase_user_id, avatar_url)
  2. `farmers` (id, user_id, name, village, district, fpo_id, land_holding_acres, phone)
  3. `fpos` (id, user_id, name, district, registration_no, member_count, contact)
  4. `buyers` (id, user_id, name, buyer_type, location, verified, documents_verified)
  5. `crops` (id, name, category, standard_grade, unit)
  6. `markets` (id, name, district, state, latitude, longitude, address, pincode, location_source)
  7. `market_prices` (id, market_id, crop_id, commodity, variety, min_price, modal_price, max_price, arrival_quantity, date, source, source_url, data_status, observed_at, updated_at)
  8. `quality_grades` (id, crop_id, grade, moisture_pct, foreign_matter_pct, damage_pct)
  9. `lots` (id, owner_id, owner_type, crop_id, variety, quantity_quintals, grade, location, district, status)
  10. `buyer_demands` (id, buyer_id, crop_id, quantity_quintals, max_price, target_grade, status)
  11. `offers` (id, demand_id, lot_id, buyer_id, farmer_or_fpo_id, offer_price, quantity_quintals, status)
  12. `transactions` (id, lot_id, buyer_id, seller_id, stage, total_amount, payment_status, logistics_status)
  13. `logistics` (id, transaction_id, provider_name, vehicle_type, estimated_cost, pickup_date, tracking_status)
  14. `storage_facilities` (id, name, location, district, address, latitude, longitude, type, temperature_controlled, capacity_quintals, available_capacity_quintals, cost_per_day_per_quintal, contact, verified, source)
  15. `payments` (id, transaction_id, amount, method, status, escrow_status)
  16. `grievances` (id, raised_by_user_id, title, category, description, status, resolution)
  17. `notifications` (id, user_id, message, read, created_at)
  18. `forecast_runs` (id, crop_id, market_id, horizon_days, mae, rmse, r2, predictions_json)
  19. `market_data_sync_logs` (id, source, records_fetched, records_inserted, records_updated, records_rejected, status, message, created_at)

---

## 3. Supabase Integration Status

- **Client Configuration:** PKCE auth client initialized in `client/src/lib/supabase.ts` with browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Server Admin Client:** Initialized in `server/lib/supabase.js` using confidential `SUPABASE_SERVICE_ROLE_KEY`.
- **Connection Health Check:** API endpoint `/rest/v1/` tested with service role key: **HTTP 200 OK**.
- **Current State in User Supabase Project:**
  - Supabase URL and credentials configured and authenticating properly.
  - The OpenAPI spec currently returns 0 tables because the DDL migration script (`server/supabase-schema.sql`) needs to be executed in the Supabase SQL editor by the database administrator.
  - Full instructions are provided in `SUPABASE_SETUP.md`.

---

## 4. Authentication Architecture & RBAC

- **Authentication Providers:**
  1. Standard Email / Username + Password with bcrypt-compatible PBKDF2 / SHA256 password hashing.
  2. Google OAuth via Supabase Auth (`supabase.auth.signInWithOAuth({ provider: 'google' })`).
- **Role-Based Access Control (RBAC):**
  - Supported application roles: `farmer`, `fpo`, `buyer`, `admin`.
  - Roles enforced via backend middleware (`server/lib/authMiddleware.js`) and client context (`client/src/context/AuthContext.tsx`).
  - Protected API routes strictly reject unauthorized role actions (e.g. non-admins cannot invoke market sync or view all user tables).
  - First-time Google OAuth sign-in routes users to a mandatory Role Selection modal (`Farmer`, `Buyer`, `FPO`).
  - **Self-selection of `admin` role is strictly blocked on the backend (`/api/auth/assign-role`).**

---

## 5. Google OAuth Status

- **Flow:** Supabase Auth handles the Google OAuth 2.0 flow natively.
- **Frontend Trigger:** "Continue with Google" button on `/login` and `/register`.
- **Session Sync:** Successful OAuth callbacks redirect back to the platform, where `AuthContext` listens to `onAuthStateChange` and synchronizes the user profile via `POST /api/auth/sync-oauth`.
- **Setup Guide:** Complete documentation provided in `GOOGLE_AUTH_SETUP.md`.

---

## 6. Gemini AI Saathi Status

- **Status:** **ACTIVE & OPERATIONAL** (Tested & Verified).
- **Endpoint:** `POST /api/assistant/chat` and `POST /api/assistant/ask`.
- **Model Hierarchy:** Primary: `gemini-flash-lite-latest` and `gemini-3.1-flash-lite` (latency ~800ms). Fallback: `gemini-flash-latest`.
- **Grounding Context:** Automatically queries real database mandi prices, APMC coordinates, distance calculations, and nearby storage facilities before passing context to Gemini.
- **Strict Anti-Hallucination:** Explicit system instruction prohibiting fabricated prices, imaginary subsidies, or false guarantees.
- **Deterministic Fallback:** If `GEMINI_API_KEY` is missing or upstream Google API encounters network limits, AI Saathi automatically falls back to deterministic rule-based answers without crashing.

---

## 7. Market Data Sources & Provenance

- **Primary Source:** **Government of India Open Government Data (data.gov.in / AGMARKNET)**.
- **Validation Rules:**
  - $\text{min\_price} \le \text{modal\_price} \le \text{max\_price}$
  - Positive non-zero numbers only.
  - Standardized units to ₹/quintal.
- **Deduplication:** `UPSERT` on `(market_id, crop_id, date)`.
- **Freshness Badges:** `LIVE` (only for verified current-day arrivals), `LATEST AVAILABLE`, `HISTORICAL`, and `SEEDED DEMO`.

---

## 8. Map Implementation

- **Library:** Leaflet 1.9.4 + OpenStreetMap.
- **Cost-Resilience:** **Zero Google Maps API key required for map rendering**. Runs completely free of Google Cloud billing.
- **Features:**
  - Layer toggles: All, Mandis, Storage Hubs, Nearby (<60km).
  - Search bar: Real-time search across market names, storage hubs, and districts.
  - Geolocation: "Use My Location" GPS button with permission handling.
  - Markers: Custom colored icons for Mandis (green), Storage (blue), FPOs (purple), and Farmer (amber).
  - External Directions: "Directions" and "Open in Google Maps" open Google Maps navigation externally without requiring the paid Maps JavaScript API.

---

## 9. Storage Implementation

- Regional cold storage facilities and APMC warehouses registered with coordinates, verified WDRA status, available space, daily rates, and crop suitability.
- Connected to Market Comparison via **"Nearby Storage"** lookup to prevent distress selling.

---

## 10. Existing Render Configuration

- `render.yaml` configured for Render Web Service:
  - Runtime: Node.js (Singapore region for low India latency).
  - Build command: `cd client && npm install && npm run build && cd ../server && npm install`.
  - Start command: `cd server && npm run seed:if-empty && npm start`.
  - Health check path: `/health` (verified returning HTTP 200).

---

## 11. Existing Git & GitHub State

- **Repository:** `https://github.com/alfhisk9-sketch/kisansetu.git`
- **Branch:** `main`
- **Working Tree:** Clean.
- **Secret Verification:** `.env`, `server/.env`, and `client/.env` are 100% ignored and untracked.

---

## 12. Security Risks & Mitigation

| Risk | Mitigation Status |
|---|---|
| API Key Leakage | Verified: Zero secrets in git, `.env` ignored, `.env.example` has empty placeholders only. |
| Admin Role Privilege Escalation | Mitigated: Backend blocks self-assigning `admin` via OAuth role assignment. |
| Map API Quota Exhaustion | Mitigated: Uses OpenStreetMap + Leaflet; external navigation links only. |
| AI Hallucination | Mitigated: System prompt grounding with real mandi database prices. |

---

## 13. Deployment Readiness

- Frontend bundle: `tsc -b && vite build` built cleanly in 12.45s.
- Backend server: API routes tested and working.
- Health endpoint: Returns HTTP 200.
- Repository: Fully committed and pushed to `origin main`.
