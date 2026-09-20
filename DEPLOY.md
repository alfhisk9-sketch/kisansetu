# KisanSetu — Production Deployment Guide (Render & Cloud Platforms)

This document provides complete instructions for deploying the **KisanSetu** application to production on **Render** (or any Node.js container service like Railway, Fly.io, or AWS ECS).

---

## 1. Unified Architecture Overview

KisanSetu is architected as a **single deployable web service**:
- The **React/Vite** client builds to static assets in `client/dist`.
- The **Node/Express** backend serves both the `/api/*` REST endpoints and the static client bundle from `client/dist`.
- This eliminates cross-origin CORS complications in production, keeps API calls same-origin, and drastically minimizes cloud hosting costs (runs smoothly on Render Free tier).

```
Client (Browser / PWA)
         │  Same-origin HTTP / HTTPS
         ▼
Render Web Service (Node.js 18+)
   ├── Express API Routes (/api/*)
   ├── Health Check (/health & /api/health)
   └── Static Frontend Assets (client/dist)
         │
         ├── Google Gemini 1.5 Flash (via server-side GEMINI_API_KEY)
         └── Supabase PostgreSQL (via SUPABASE_URL & Service Role Key)
             [Fallback: Local SQLite with WAL mode]
```

---

## 2. Deploying to Render via `render.yaml`

KisanSetu includes a validated Blueprint specification in `render.yaml`:

```yaml
services:
  - type: web
    name: kisansetu
    runtime: node
    plan: free
    region: singapore
    buildCommand: >
      cd client && npm install && npm run build &&
      cd ../server && npm install
    startCommand: cd server && npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: GEMINI_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
```

### Deployment Steps:
1. Push your repository to **GitHub** or **GitLab**.
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Select your `KisanSetu` repository. Render will automatically detect `render.yaml`.
5. Under Environment Variables, input your secret keys:
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `SUPABASE_URL` *(optional)*: Your Supabase project URL (`https://xyz.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY` *(optional)*: Your Supabase service role key.
6. Click **Apply**. Render will automatically build the Vite client, install server dependencies, seed the baseline data, and start the service.

---

## 3. Manual Web Service Setup (Alternative)

If you prefer configuring the Web Service manually on Render:
1. **Service Type**: Web Service
2. **Environment**: Node.js
3. **Region**: Singapore (recommended for low latency in India)
4. **Build Command**:
   ```bash
   cd client && npm install && npm run build && cd ../server && npm install
   ```
5. **Start Command**:
   ```bash
   cd server && npm start
   ```
6. **Health Check Path**: `/health`

---

## 4. Health Check Verification

Once deployed, verify that the health endpoint returns `200 OK`:

```bash
curl https://your-app-name.onrender.com/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "service": "kisansetu-platform",
  "version": "2.0.0",
  "timestamp": "2026-09-18T17:15:00.000Z"
}
```

---

## 5. Troubleshooting & Zero-Downtime Notes

- **Initial Cold Start**: On the Render free tier, web services spin down after 15 minutes of inactivity. The first request may take ~30-45 seconds to wake up the service.
- **Persistent Database**: If using the local SQLite mode (`better-sqlite3`), data resets when Render re-deploys unless a Render Persistent Disk is attached at `/server/data`. For permanent multi-instance production storage, configure **Supabase PostgreSQL** via `SUPABASE_URL`.
