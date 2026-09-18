-- ============================================================================
-- KisanSetu — Supabase PostgreSQL Production Schema & RLS Policies
-- Smart Agricultural Market Linkage & Price Discovery Platform
-- Target: Supabase / PostgreSQL 15+
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing tables if needed (run with care)
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT ('user-' || substr(md5(random()::text), 1, 10)),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('farmer', 'fpo', 'buyer', 'admin')),
    display_name TEXT NOT NULL,
    phone TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FARMERS PROFILE
CREATE TABLE IF NOT EXISTS public.farmers (
    id TEXT PRIMARY KEY DEFAULT ('farmer-' || substr(md5(random()::text), 1, 10)),
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    village TEXT,
    district TEXT,
    fpo_id TEXT,
    land_holding_acres NUMERIC(6, 2),
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FPOS (Farmer Producer Organizations)
CREATE TABLE IF NOT EXISTS public.fpos (
    id TEXT PRIMARY KEY DEFAULT ('fpo-' || substr(md5(random()::text), 1, 10)),
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    district TEXT,
    registration_no TEXT,
    member_count INTEGER DEFAULT 0,
    contact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BUYERS PROFILE
CREATE TABLE IF NOT EXISTS public.buyers (
    id TEXT PRIMARY KEY DEFAULT ('buyer-' || substr(md5(random()::text), 1, 10)),
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    buyer_type TEXT CHECK (buyer_type IN ('Processor', 'Wholesaler', 'Retail chain', 'Institutional buyer', 'Exporter', 'Digital trader')),
    location TEXT,
    verified BOOLEAN DEFAULT FALSE,
    documents_verified BOOLEAN DEFAULT FALSE,
    transactions_completed INTEGER DEFAULT 0,
    payment_reliability_pct NUMERIC(5, 2) DEFAULT 0,
    response_rate_pct NUMERIC(5, 2) DEFAULT 0,
    contact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CROPS CATALOG
CREATE TABLE IF NOT EXISTS public.crops (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    unit TEXT DEFAULT 'quintal',
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. MARKETS (MANDIS / APMCs)
CREATE TABLE IF NOT EXISTS public.markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    lat NUMERIC(9, 6),
    lng NUMERIC(9, 6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MARKET PRICES (Historical & Daily Arrivals)
CREATE TABLE IF NOT EXISTS public.market_prices (
    id TEXT PRIMARY KEY DEFAULT ('mp-' || substr(md5(random()::text), 1, 12)),
    market_id TEXT REFERENCES public.markets(id) ON DELETE CASCADE,
    crop_id TEXT REFERENCES public.crops(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    min_price NUMERIC(10, 2),
    max_price NUMERIC(10, 2),
    modal_price NUMERIC(10, 2) NOT NULL,
    arrival_qty_quintals NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_market_crop_date UNIQUE (market_id, crop_id, date)
);

-- 8. QUALITY GRADES
CREATE TABLE IF NOT EXISTS public.quality_grades (
    id TEXT PRIMARY KEY DEFAULT ('grade-' || substr(md5(random()::text), 1, 10)),
    lot_id TEXT,
    grade TEXT CHECK (grade IN ('A', 'B', 'C')),
    size_rating TEXT,
    moisture_rating TEXT,
    damage_pct NUMERIC(5, 2),
    foreign_material_pct NUMERIC(5, 2),
    appearance_rating TEXT,
    verified_by TEXT,
    verified BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. PRODUCE LOTS
CREATE TABLE IF NOT EXISTS public.lots (
    id TEXT PRIMARY KEY DEFAULT ('lot-' || substr(md5(random()::text), 1, 10)),
    owner_type TEXT CHECK (owner_type IN ('farmer', 'fpo')),
    owner_id TEXT NOT NULL,
    crop_id TEXT REFERENCES public.crops(id) ON DELETE RESTRICT,
    variety TEXT,
    quantity_quintals NUMERIC(10, 2) NOT NULL,
    grade TEXT DEFAULT 'A',
    location TEXT NOT NULL,
    district TEXT NOT NULL,
    harvest_date DATE,
    available_from DATE,
    expected_price NUMERIC(10, 2) NOT NULL,
    min_acceptable_price NUMERIC(10, 2),
    storage_available BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'Open for offers' CHECK (status IN ('Open for offers', 'Under negotiation', 'Sold', 'Closed', 'Withdrawn')),
    is_aggregated BOOLEAN DEFAULT FALSE,
    source_lot_ids JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BUYER DEMANDS
CREATE TABLE IF NOT EXISTS public.buyer_demands (
    id TEXT PRIMARY KEY DEFAULT ('demand-' || substr(md5(random()::text), 1, 10)),
    buyer_id TEXT REFERENCES public.buyers(id) ON DELETE CASCADE,
    crop_id TEXT REFERENCES public.crops(id) ON DELETE RESTRICT,
    quantity_quintals NUMERIC(10, 2) NOT NULL,
    grade_required TEXT DEFAULT 'A',
    required_by DATE,
    offer_price NUMERIC(10, 2),
    location TEXT,
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Fulfilled', 'Expired', 'Cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. OFFERS (Bids by Buyers on Lots)
CREATE TABLE IF NOT EXISTS public.offers (
    id TEXT PRIMARY KEY DEFAULT ('offer-' || substr(md5(random()::text), 1, 10)),
    lot_id TEXT REFERENCES public.lots(id) ON DELETE CASCADE,
    buyer_id TEXT REFERENCES public.buyers(id) ON DELETE CASCADE,
    offer_price NUMERIC(10, 2) NOT NULL,
    quantity_quintals NUMERIC(10, 2) NOT NULL,
    delivery_date DATE,
    payment_terms TEXT,
    expiry_date DATE,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Rejected', 'Countered', 'Expired')),
    counter_of TEXT REFERENCES public.offers(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY DEFAULT ('txn-' || substr(md5(random()::text), 1, 10)),
    lot_id TEXT REFERENCES public.lots(id) ON DELETE RESTRICT,
    offer_id TEXT REFERENCES public.offers(id) ON DELETE RESTRICT,
    farmer_or_fpo_id TEXT NOT NULL,
    buyer_id TEXT REFERENCES public.buyers(id) ON DELETE RESTRICT,
    quantity_quintals NUMERIC(10, 2) NOT NULL,
    agreed_price NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    stage TEXT DEFAULT 'Deal Accepted' CHECK (stage IN ('Deal Accepted', 'Invoice Generated', 'Goods Dispatched', 'Goods Delivered', 'Payment Initiated', 'Payment Received')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. LOGISTICS & DISPATCH
CREATE TABLE IF NOT EXISTS public.logistics (
    id TEXT PRIMARY KEY DEFAULT ('log-' || substr(md5(random()::text), 1, 10)),
    transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
    pickup_location TEXT,
    destination TEXT,
    quantity_quintals NUMERIC(10, 2),
    distance_km NUMERIC(8, 2),
    transport_cost NUMERIC(10, 2),
    vehicle_requirement TEXT,
    pickup_date DATE,
    delivery_date DATE,
    status TEXT DEFAULT 'Requested' CHECK (status IN ('Requested', 'Assigned', 'In Transit', 'Delivered')),
    vehicle_no TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. STORAGE FACILITIES (Cold storage / Warehouses)
CREATE TABLE IF NOT EXISTS public.storage_facilities (
    id TEXT PRIMARY KEY DEFAULT ('storage-' || substr(md5(random()::text), 1, 10)),
    name TEXT NOT NULL,
    location TEXT,
    district TEXT NOT NULL,
    capacity_quintals NUMERIC(12, 2) NOT NULL,
    available_capacity_quintals NUMERIC(12, 2) NOT NULL,
    cost_per_day_per_quintal NUMERIC(8, 2) NOT NULL,
    crop_suitability TEXT,
    contact TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT ('pay-' || substr(md5(random()::text), 1, 10)),
    transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    buyer_id TEXT,
    payee_id TEXT,
    date DATE DEFAULT CURRENT_DATE,
    method TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Initiated', 'Received', 'Delayed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. GRIEVANCES & DISPUTES
CREATE TABLE IF NOT EXISTS public.grievances (
    id TEXT PRIMARY KEY DEFAULT ('grv-' || substr(md5(random()::text), 1, 10)),
    transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
    raised_by TEXT NOT NULL,
    issue_category TEXT CHECK (issue_category IN ('Quality dispute', 'Quantity dispute', 'Payment delay', 'Logistics issue', 'Buyer issue', 'Other')),
    description TEXT NOT NULL,
    evidence TEXT,
    status TEXT DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Evidence Requested', 'Resolved', 'Rejected')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT ('notif-' || substr(md5(random()::text), 1, 10)),
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. FORECAST RUNS
CREATE TABLE IF NOT EXISTS public.forecast_runs (
    id TEXT PRIMARY KEY DEFAULT ('fc-' || substr(md5(random()::text), 1, 10)),
    crop_id TEXT REFERENCES public.crops(id) ON DELETE CASCADE,
    market_id TEXT REFERENCES public.markets(id) ON DELETE CASCADE,
    horizon_days INTEGER NOT NULL,
    method TEXT NOT NULL,
    predicted_price NUMERIC(10, 2),
    mae NUMERIC(10, 4),
    rmse NUMERIC(10, 4),
    r2 NUMERIC(10, 4),
    trained_on_rows INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lots_owner ON public.lots(owner_id);
CREATE INDEX IF NOT EXISTS idx_lots_crop ON public.lots(crop_id);
CREATE INDEX IF NOT EXISTS idx_lots_status ON public.lots(status);
CREATE INDEX IF NOT EXISTS idx_market_prices_crop_market_date ON public.market_prices(crop_id, market_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_offers_lot ON public.offers(lot_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer ON public.offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_participants ON public.transactions(farmer_or_fpo_id, buyer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

-- Public catalogs are readable by everyone
CREATE POLICY "Public catalogs readable by all" ON public.crops FOR SELECT USING (true);
CREATE POLICY "Markets readable by all" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Market prices readable by all" ON public.market_prices FOR SELECT USING (true);
CREATE POLICY "Storage facilities readable by all" ON public.storage_facilities FOR SELECT USING (true);
CREATE POLICY "Open lots readable by all authenticated users" ON public.lots FOR SELECT USING (true);
CREATE POLICY "Buyers directory readable by all" ON public.buyers FOR SELECT USING (true);

-- End of schema
