# KisanSetu — Security Architecture & Production Audit

This document outlines the security controls, authentication mechanisms, credential handling, and threat mitigation strategies implemented across KisanSetu.

---

## 1. Secrets & Credentials Isolation

| Secret / Key | Permitted Environment | Client Exposure | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | **Server-side only** | ❌ **NEVER** | Grounded AI market intelligence via Gemini 1.5 Flash |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-side only** | ❌ **NEVER** | Backend administration and database seeding |
| `SUPABASE_ANON_KEY` | Frontend Client | ✅ Allowed | Public read access & realtime client subscriptions |
| `VITE_SUPABASE_URL` | Frontend Client | ✅ Allowed | Public endpoint URL |

- All `.env` files are strictly excluded from git tracking via `.gitignore`.
- Vite client builds bundle zero server environment variables.
- All AI queries pass through `POST /api/assistant/ask` on the Express backend; the client never calls external AI endpoints directly.

---

## 2. Authentication & Password Security

- **Salted Password Hashing**: Passwords for registered accounts and updated passwords are encrypted using Node.js built-in `crypto.scryptSync` with unique 16-byte random salts (`salt:hash`).
- **Timing-Safe Equality**: Password verification uses `crypto.timingSafeEqual` to prevent timing attack vulnerabilities.
- **Transparent Legacy Upgrade**: When existing demo accounts (e.g. `shaik.rabbani`) log in, the server automatically and transparently upgrades their legacy hash without requiring user intervention.
- **Session Tokens**: Cryptographically random signed session tokens are generated on login (`ks_<payload>.<sig>`).

---

## 3. Role-Based Access Control (RBAC)

KisanSetu enforces strict authorization at two complementary layers:

1. **Frontend Route Guards (`<Protected roles={[...]}>`)**:
   - `farmer`: Dashboard, Market Intelligence, Compare, Lots, Marketplace, Storage, Forecast, Transactions, Assistant, Profile.
   - `fpo`: All farmer capabilities plus **FPO Aggregation**.
   - `buyer`: Dashboard, Marketplace, Transactions, Profile.
   - `admin`: Dashboard, Admin Dashboard, Grievances.

2. **Backend Authorization Middleware (`server/lib/authMiddleware.js`)**:
   - Write endpoints validate the caller's role header/token before executing database mutations.
   - Unauthorized attempts receive HTTP `401 Unauthorized` or `403 Forbidden` with standardized error codes.

---

## 4. HTTP Security Headers & Error Sanitization

The Express server sets defensive headers on every response:
- `X-Content-Type-Options: nosniff` (prevents MIME type sniffing)
- `X-Frame-Options: SAMEORIGIN` (mitigates clickjacking)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

**Error Sanitization**:
- Malformed JSON payloads return a clean `400 Bad Request` with `{ "error": "Malformed JSON in request body" }`.
- Internal server errors return a generic `500 Internal Server Error`; raw database drivers and stack traces are never exposed to clients.
- Missing required fields return structured `400` errors before reaching the database layer.

---

## 5. Input Validation & SQL Injection Mitigation

- All database queries across `better-sqlite3` and PostgreSQL use parameterized bindings (`?` or `$1`), preventing SQL injection.
- Endpoint parameters are strictly validated using `assertRequired(req, res, [...fields])`.
