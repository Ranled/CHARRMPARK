-- ============================================================
-- CHARRMPASS — RELATIONAL DATABASE SCHEMA v3.0
-- Dual-Gate Architecture: ENTRY / EXIT as independent events
-- Tables: users, vehicles, rfid_cards, transactions,
--         special_tags, system_accounts, devices
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name             TEXT NOT NULL,
    age                   INTEGER,
    sex                   TEXT,
    address               TEXT,
    program               TEXT,
    section               TEXT,
    role                  TEXT CHECK (role IN ('Student', 'Faculty', 'Staff', 'Visitor')),
    profile_image         TEXT,
    id_front_image        TEXT,
    id_back_image         TEXT,
    drivers_license_image TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. VEHICLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vehicles (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
    vehicle_type     TEXT CHECK (vehicle_type IN ('Motorcycle', 'Car', 'Truck', 'Van', 'SUV', 'Other')),
    vehicle_model    TEXT,
    plate_number     TEXT UNIQUE NOT NULL,
    vehicle_color    TEXT,
    motorcycle_image TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. RFID CARDS TABLE
--    authorization_status controls whether gate opens.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rfid_cards (
    id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    rfid_uid             TEXT UNIQUE NOT NULL,
    vehicle_id           UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    user_id              UUID REFERENCES public.users(id) ON DELETE CASCADE,
    authorization_status TEXT DEFAULT 'PENDING' CHECK (authorization_status IN ('PENDING', 'AUTHORIZED', 'DENIED')),
    issued_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. TRANSACTIONS TABLE  (replaces parking_logs)
--    Every RFID tap = ONE row. direction tells you ENTRY or EXIT.
--    Entry and Exit gates write completely independently.
--
--    "Currently Inside" = COUNT(ENTRY) - COUNT(EXIT) per rfid_uid
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    rfid_uid    TEXT NOT NULL,
    vehicle_id  UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    user_id     UUID REFERENCES public.users(id)    ON DELETE SET NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('ENTRY', 'EXIT')),
    gate        TEXT,                        -- device identifier of the gate that generated this
    timestamp   TIMESTAMPTZ DEFAULT NOW(),
    status      TEXT DEFAULT 'AUTHORIZED' CHECK (status IN ('AUTHORIZED', 'DENIED', 'PENDING')),
    remarks     TEXT
);

-- ============================================================
-- 5. SPECIAL TAGS TABLE (Visitor & Emergency cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.special_tags (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    rfid_uid    TEXT UNIQUE NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('VISITOR', 'EMERGENCY')),
    label       TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. SYSTEM ACCOUNTS (Admin / Guard RBAC)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_accounts (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('ADMIN', 'GUARD')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. DEVICES TABLE (ESP32 registry)
--    gate_type: ENTRY = Entry gate unit, EXIT = Exit gate unit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devices (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_name      TEXT NOT NULL,
    device_location  TEXT NOT NULL,
    esp32_identifier TEXT UNIQUE NOT NULL,
    gate_type        TEXT DEFAULT 'ENTRY' CHECK (gate_type IN ('ENTRY', 'EXIT', 'ADMIN')),
    status           TEXT DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE')),
    last_online      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfid_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_tags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_users"            ON public.users;
DROP POLICY IF EXISTS "anon_vehicles"         ON public.vehicles;
DROP POLICY IF EXISTS "anon_rfid_cards"       ON public.rfid_cards;
DROP POLICY IF EXISTS "anon_transactions"     ON public.transactions;
DROP POLICY IF EXISTS "anon_special_tags"     ON public.special_tags;
DROP POLICY IF EXISTS "anon_system_accounts"  ON public.system_accounts;
DROP POLICY IF EXISTS "anon_devices"          ON public.devices;

CREATE POLICY "anon_users"           ON public.users           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_vehicles"        ON public.vehicles         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_rfid_cards"      ON public.rfid_cards       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_transactions"    ON public.transactions     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_special_tags"    ON public.special_tags     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_system_accounts" ON public.system_accounts  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_devices"         ON public.devices          FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 9. REALTIME CONFIGURATION
-- ============================================================
ALTER TABLE public.transactions  REPLICA IDENTITY FULL;
ALTER TABLE public.rfid_cards    REPLICA IDENTITY FULL;
ALTER TABLE public.users         REPLICA IDENTITY FULL;
ALTER TABLE public.special_tags  REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rfid_cards') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_cards;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'special_tags') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.special_tags;
    END IF;
END $$;

-- ============================================================
-- 10. MIGRATIONS (safe column additions for existing tables)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'devices'
          AND column_name  = 'gate_type'
    ) THEN
        ALTER TABLE public.devices
            ADD COLUMN gate_type TEXT DEFAULT 'ENTRY'
            CHECK (gate_type IN ('ENTRY', 'EXIT', 'ADMIN'));
    END IF;
END $$;

-- ============================================================
-- 11. SEED DATA
-- ============================================================
INSERT INTO public.system_accounts (username, password, role) VALUES
    ('guard', 'guard123', 'GUARD'),
    ('admin', 'admin123', 'ADMIN')
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.devices (device_name, device_location, esp32_identifier, gate_type) VALUES
    ('CHARRMPASS Entry Unit', 'Entry Gate',  'CHARRMPASS_GATE_ENTRY', 'ENTRY'),
    ('CHARRMPASS Exit Unit',  'Exit Gate',   'CHARRMPASS_GATE_EXIT',  'EXIT')
ON CONFLICT (esp32_identifier) DO NOTHING;

