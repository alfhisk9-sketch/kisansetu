# KisanSetu (किसानसेतु) — Smart Agricultural Market Linkage & Price Discovery Platform

> **"Sell Smarter. Earn Better."**  
> *Connecting Indian Farmers and FPOs to High-Value Markets, Verified Institutional Buyers, and Transparent Net Realization Discovery.*

KisanSetu is a modern, production-grade agricultural technology web application and Progressive Web App (PWA) built for **Smart India Hackathon 2026** (Problem Statement 26132). 

It replaces deceptive mandi headline prices with true **Net In-Hand Realization**, connects smallholders with verified institutional buyers, enables FPO crop aggregation, and integrates **Google Gemini 1.5 Flash** for grounded conversational agricultural advice across Indian regional languages.

---

## 🌟 Key Highlights & Differentiators

1. **True Net In-Hand Realization Discovery**:
   $$\text{Net Realization} = \text{Mandi Headline Price} - \text{Road Freight} - \text{Handling/Loading} - \text{Mandi Cess}$$
   Farmers make decisions based on what lands in their bank accounts rather than unachievable headline quotes.

2. **KisanSetu AI Saathi (किसानसेतु एआई साथी)**:
   Powered by **Google Gemini 1.5 Flash**, the AI assistant is strictly grounded in real-time platform data (mandi arrivals, quality standards, transport rates) and answers naturally in **Hindi, Marathi, Telugu, and English** with strict anti-hallucination guardrails.

3. **4-Language Native Multilingual Support (i18n)**:
   Instant, flicker-free language switching across English, हिंदी, मराठी, and తెలుగు across all 16 screens.

4. **Mobile-First Progressive Web App (PWA)**:
   Designed for 360px+ touchscreens with an ergonomic 5-tab farmer bottom navigation (`Home`, `Markets`, `Sell`, `Offers`, `AI Saathi`), offline service worker caching, and network disconnection banners.

5. **Verified B2B Produce Marketplace**:
   Transparent trading with GST-verified food processors, retail chains, and exporters featuring counter-offers, digital escrow tracking, and logistics coordination.

6. **Dual-Mode Database Architecture (SQLite + Supabase PostgreSQL)**:
   Runs 100% offline out-of-the-box using local SQLite WAL, with zero-friction migration to **Supabase PostgreSQL** via a full RLS-enabled schema.

---

## 🏗️ System Architecture

```
[ Progressive Web App (Client) ] ── (React 18 + TailwindCSS + Recharts + Lucide)
                │
                │ Same-origin HTTPS REST
                ▼
[ Node.js / Express 4.19 Web Service ] ── Render Web Service / Linux Container
   ├── /health & /api/health (Deployment monitoring)
   ├── Security Headers & Sanitization Layer
   ├── Salted scrypt Password Security & Token Verification
   ├── Core Deterministic Engine (Net Realization, Mandi Ranking)
   ├── Ridge-Regression Price Forecast Engine (MAE, RMSE, R²)
   └── Static Frontend Distribution (client/dist)
          │
          ├── Google Gemini 1.5 Flash (Grounded AI Saathi via GEMINI_API_KEY)
          └── Supabase PostgreSQL / Local SQLite with WAL mode
```

---

## 📱 User Roles & Capabilities

| Role | Primary User Journey | Key Pages |
|---|---|---|
| **Farmer** | Check mandi arrivals, compare net profits, list produce lots, receive buyer bids, request transport, consult AI Saathi | Dashboard, Market Intelligence, Compare, Lots, Marketplace, Storage, Forecast, Assistant |
| **FPO Lead** | Aggregate smallholder member crops into commercial bulk lots, negotiate volume pricing, inspect member quality | All Farmer pages + **FPO Aggregation Portal** |
| **Buyer / Wholesaler** | Browse open produce lots, submit binding bids, post bulk procurement demands, track delivery dispatch | Dashboard, Marketplace, Transactions, Demands |
| **Platform Admin** | Audit market price feeds, oversee dispute resolution (grievances), monitor trader verification and system health | Admin Dashboard, Grievances, Health Monitoring |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+ installed
- npm 9+

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/your-org/kisansetu.git
cd kisansetu/KisanSetu-FINAL

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Seed Database & Start
```bash
# Seed the local SQLite database with realistic APMC mandi data
cd ../server
npm run seed

# Start server (runs on http://localhost:4000)
npm start
```

In another terminal, start the Vite development server:
```bash
cd client
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🔑 Demo Review Accounts

All demo accounts share the password: `demo123`

| Role | Username | Display Name | Location |
|---|---|---|---|
| **Farmer** | `shaik.rabbani` | Shaik Rabbani | Duggirala, Guntur |
| **Farmer** | `shaik.alfhi` | Shaik Alfhi | Tenali, Guntur |
| **FPO Lead** | `koushik` | Koushik (FPO Lead) | Guntur District |
| **Verified Buyer** | `d.krishna` | D. Krishna (Wholesaler) | Vijayawada |
| **Digital Trader** | `akshay` | Akshay (Trader) | Visakhapatnam |
| **Admin** | `hemasri` | Hemasri (Admin) | State Agri Directorate |

*Tip: The login screen includes quick one-click demo pill buttons to instantly populate credentials during evaluations.*

---

## 🌐 Production Deployment (Render)

KisanSetu deploys to [Render](https://render.com) with zero manual infrastructure:
1. Connect your repository to Render via **New +** → **Blueprint**.
2. Render detects `render.yaml` and executes:
   - Build: `cd client && npm install && npm run build && cd ../server && npm install`
   - Start: `cd server && npm run seed:if-empty && npm start`
   - Health Check: `/health`
3. Add your `GEMINI_API_KEY` under environment variables.

See [`DEPLOY.md`](./DEPLOY.md) for full deployment details and zero-downtime guidance.

---

## 📚 Documentation Index

- [`DEPLOY.md`](./DEPLOY.md): Render and container deployment guidelines.
- [`SECURITY.md`](./SECURITY.md): Security architecture, salted hashing, and RBAC matrix.
- [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md): Supabase PostgreSQL schema migration and RLS guide.
- [`GEMINI_SETUP.md`](./GEMINI_SETUP.md): Google Gemini AI configuration and grounding rules.
- [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md): 21-point production verification checklist.
- [`server/supabase-schema.sql`](./server/supabase-schema.sql): Full PostgreSQL DDL script with constraints and indexes.
- [`docs/MODEL_CARD.md`](./docs/MODEL_CARD.md): Ridge-regression forecast methodology and honest accuracy metrics.

---

## 👥 Contributors & SIH 2026 Team

Built with dedication for Indian agricultural prosperity.
