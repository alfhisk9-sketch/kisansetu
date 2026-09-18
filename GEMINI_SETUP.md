# KisanSetu — Google Gemini AI Integration Guide

This guide describes how to configure and customize **Google Gemini 1.5 Flash** inside **KisanSetu AI Saathi (किसानसेतु एआई साथी)**.

---

## 1. Obtain a Free Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API Key** → **Create API Key**.
4. Copy the generated key.

---

## 2. Configure Environment Variable

Add the key to your server environment:

In `server/.env`:
```env
GEMINI_API_KEY=
```

On Render / Cloud Hosting:
- Go to your Web Service → **Environment** tab.
- Add an environment variable named `GEMINI_API_KEY` with your key value.
- Click **Save Changes**.

> [!IMPORTANT]
> Never set `GEMINI_API_KEY` in frontend client files or prefix it with `VITE_`. The browser client must never have access to the AI API key.

---

## 3. How AI Saathi Works

KisanSetu AI Saathi follows a **Strict Grounded Architecture**:

```
[Farmer asks a question in Hindi, Marathi, Telugu, or English]
                     │
                     ▼
             POST /api/assistant/ask
                     │
                     ├─> Server extracts caller profile (Farmer, location: Guntur)
                     ├─> Server queries current mandi arrivals & modal prices
                     ├─> Server calculates net realization & nearest APMC mandis
                     │
                     ▼
          Grounding Context Builder
(Combines actual verified mandi data into system instruction context)
                     │
                     ▼
        Google Gemini 1.5 Flash API
 (Instructed never to hallucinate or invent prices)
                     │
                     ▼
         Natural, Practical Explanation Returned
(In the user's selected language, citing exact numbers from platform data)
```

---

## 4. Deterministic Offline Fallback

If `GEMINI_API_KEY` is not provided, or if the user's internet is degraded:
- The system automatically falls back to deterministic rule-based templates.
- The UI displays an honest status badge: `Platform Data Engine` instead of fabricating AI responses.
- Core market comparison, price discovery, lot creation, and trade execution remain 100% functional.
