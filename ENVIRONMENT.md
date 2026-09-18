# KisanSetu — Environment Configuration & Security Architecture

This document specifies the strict separation between public frontend client variables and confidential server-only secrets.

---

## 1. Environment Architecture Principles

1. **Zero Real Secrets in Git**: Real secrets must **ONLY** exist in your local `.env` or in Render's / deployment provider's secret manager.
2. **Empty Placeholders in `.env.example`**: `.env.example` files must contain **empty placeholders only**. They must never contain live keys or tokens.
3. **Frontend Isolation**: Any variable exposed to the browser MUST be prefixed with `VITE_`. Any variable without `VITE_` is strictly prohibited from client bundles.

---

## 2. Variable Classification Matrix

| Variable Name | Environment | Purpose | Security Level |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client (Frontend) | Supabase project URL | Public Safe |
| `VITE_SUPABASE_ANON_KEY` | Client (Frontend) | Public anonymous key for client RLS queries | Public Safe |
| `VITE_GOOGLE_MAPS_API_KEY` | Client (Frontend) | Optional browser Maps API key (HTTP referrer restricted) | Public Safe |
| `VITE_API_URL` | Client (Frontend) | Backend REST API endpoint path | Public Safe |
| `PORT` | Server Only | Express server listening port | Internal |
| `NODE_ENV` | Server Only | `development` or `production` | Internal |
| `CORS_ORIGIN` | Server Only | Allowed origins for API requests | Internal |
| `GEMINI_API_KEY` | **SERVER ONLY** | Google Gemini Generative AI key | **CONFIDENTIAL** |
| `GEMINI_MODEL` | Server Only | Model name (`gemini-1.5-flash`) | Internal |
| `SUPABASE_URL` | Server Only | Supabase project URL | Internal |
| `SUPABASE_SERVICE_ROLE_KEY` | **SERVER ONLY** | Supabase admin key (bypasses RLS) | **CRITICAL SECRET** |
| `SESSION_SECRET` | **SERVER ONLY** | Express session signing key | **CRITICAL SECRET** |
| `GOOGLE_CLIENT_ID` | Server Only | GCP OAuth Client ID (if server-side) | Internal |
| `GOOGLE_CLIENT_SECRET` | **SERVER ONLY** | GCP OAuth Client Secret | **CRITICAL SECRET** |

---

## 3. Verification Protocol

Run the following commands to confirm `.env` files are ignored and untracked before any commit:

```bash
# Verify .env is ignored
git check-ignore .env server/.env client/.env
# Expected:
# .env
# server/.env
# client/.env

# Verify .env is NOT tracked
git ls-files .env server/.env client/.env
# Expected: (empty output)
```

Never commit `.env` or display secrets in build logs or terminal output.
