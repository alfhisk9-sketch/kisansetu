# KisanSetu — Supabase PostgreSQL Setup & Migration Guide

This guide walks through configuring **Supabase** as the production PostgreSQL database for KisanSetu.

---

## 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com/) and create a free account.
2. Click **New Project**.
3. Choose a project name (e.g. `kisansetu-production`), database password, and region (e.g. **South Asia - Mumbai** or **Singapore** for fastest response in India).

---

## 2. Execute the Database Migration Script

1. In your Supabase project dashboard, open the **SQL Editor** from the left sidebar.
2. Click **New Query**.
3. Copy the complete contents of [`server/supabase-schema.sql`](./server/supabase-schema.sql) and paste it into the editor.
4. Click **Run** (or press `Ctrl+Enter`).

This script creates:
- All relational tables:
  1. `users` (with `auth_provider`, `supabase_user_id`, `avatar_url`)
  2. `farmers`
  3. `fpos`
  4. `buyers`
  5. `crops`
  6. `markets` (with `latitude`, `longitude`, `address`, `pincode`, `location_source`)
  7. `market_prices` (with `commodity`, `variety`, `source`, `source_url`, `data_status`, `observed_at`)
  8. `quality_grades`
  9. `lots`
  10. `buyer_demands`
  11. `offers`
  12. `transactions`
  13. `logistics`
  14. `storage_facilities` (with `latitude`, `longitude`, `type`, `temperature_controlled`, `source`)
  15. `payments`
  16. `grievances`
  17. `notifications`
  18. `forecast_runs`
  19. `market_data_sync_logs` (with sync status, records fetched/inserted/updated/rejected)
- Foreign key constraints, unique constraints on `(market_id, crop_id, date)`, and check constraints.
- Performance indexes on `lots(crop_id)`, `lots(owner_id)`, `market_prices(crop_id, market_id, date)`, and `transactions`.
- Row Level Security (RLS) policies ensuring public catalogs are readable by all while private transactions are restricted. Supports both Email and Google-authenticated Supabase users.

---

## 3. Obtain Credentials from Supabase

From your Supabase Project Settings → **API**:

| Key | Variable Name | Destination |
|---|---|---|
| Project URL | `SUPABASE_URL` | Server `.env` & Render Dashboard |
| Project URL | `VITE_SUPABASE_URL` | Client `.env` (Vite) |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` | Client `.env` (Vite) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | Server `.env` (Server ONLY — Never Client) |

---

## 4. Local Development Dual-Mode

KisanSetu operates in dual-mode:
- **Offline / Local Dev Mode**: If `SUPABASE_URL` is unset, KisanSetu automatically operates using its built-in SQLite engine (`server/data/krishisetu.db`) with WAL mode. Zero external setup required.
- **Production Mode**: When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided, the server can communicate with Supabase PostgreSQL.
