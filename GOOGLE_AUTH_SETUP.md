# KisanSetu — Google Sign-In & Supabase Auth Setup Guide

> [!NOTE]
> **Current Status: EXTERNAL CONFIGURATION REQUIRED**
>
> If you encounter `400 validation_failed Unsupported provider: provider is not enabled`, Google OAuth is disabled in your Supabase project dashboard.
> The frontend handles this gracefully by explaining the provider is not yet enabled and advising the user to use Email/Password or Demo accounts.
> To enable Google OAuth, follow Section 3 below in your Supabase dashboard.

This guide explains how Google Authentication is configured through **Supabase Auth** with Role-Based Access Control (RBAC) and profile synchronization.

---

## 1. Authentication Architecture

KisanSetu uses Supabase Auth's official OAuth provider integration:

```
KisanSetu Login Page
        ↓ (Click "Continue with Google")
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
        ↓
Google Accounts Consent Screen (accounts.google.com)
        ↓
Supabase Auth Callback (https://<project-ref>.supabase.co/auth/v1/callback)
        ↓
KisanSetu Client App (/login or /)
        ↓ (Session Detected)
Backend Profile Sync (/api/auth/sync-oauth)
        ↓ (If new user without role)
Role Selection Modal: [Farmer | Buyer | FPO]
        ↓ (/api/auth/assign-role)
Secured KisanSetu Session with RBAC & RLS
```

---

## 2. Google Cloud Platform (GCP) Configuration

Follow these exact steps in Google Cloud Console:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select your existing KisanSetu project.
3. Navigate to **APIs & Services** → **OAuth consent screen**:
   - User Type: **External**
   - App name: `KisanSetu`
   - User support email: Select your email
   - Developer contact email: Enter your contact email
   - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
4. Navigate to **APIs & Services** → **Credentials**:
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `KisanSetu Supabase Client`
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (Local Vite Dev)
     - `https://<your-supabase-project-id>.supabase.co`
     - Production application domain (e.g. `https://kisansetu.onrender.com`)
   - **Authorized redirect URIs**:
     - `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
5. Copy your **Client ID** and **Client Secret**.

---

## 3. Supabase Auth Configuration

1. In your [Supabase Dashboard](https://supabase.com/dashboard), open your project.
2. Go to **Authentication** → **Providers** → **Google**:
   - Toggle **Enable Google provider**: **ON**
   - **Client ID**: Paste GCP Client ID
   - **Client Secret**: Paste GCP Client Secret
   - Click **Save**.
3. Go to **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:5173` (or production URL)
   - **Redirect URLs**:
     - `http://localhost:5173/**`
     - `http://localhost:4000/**`
     - `https://kisansetu.onrender.com/**` (when deployed)

---

## 4. Role Selection & RBAC Security

Google OAuth provides identity (`email`, `name`, `avatar`) but **does not specify the user's role** in the agricultural ecosystem.

1. **First Login Role Picker**: If an account does not yet have an assigned application role, the UI prompts:
   *"How will you use KisanSetu?"*
   - Options:
     - 🌾 **Farmer** (Sell crops, access price forecasts, view mandis)
     - 🏢 **Buyer / Trader** (Post demands, place offers, purchase lots)
     - 👥 **FPO Representative** (Aggregate lots, verify produce quality)
2. **Admin Protection**:
   - **Users are STRICTLY PROHIBITED from self-selecting the `ADMIN` role.**
   - The backend `/api/auth/assign-role` endpoint enforces:
     ```javascript
     if (role === 'admin') {
       return res.status(403).json({ error: "Admin role cannot be self-selected" });
     }
     ```
   - Admin roles must be assigned manually in the database by an existing administrator.

---

## 5. Row-Level Security (RLS) & JWT Verification

Both Google-authenticated and Email/Password users:
- Receive valid Supabase sessions.
- Are mapped to `public.users` via `supabase_user_id`.
- Are bound by identical database RLS policies and server-side RBAC rules.
- Google authentication **never bypasses** application-level authorization.
