-- CHARRMPARK - COMPLETE SYSTEM SCHEMA
-- Includes: Users, Slots, Logs, Accounts, and Realtime Configuration

-- ============================================
-- 1. INITIAL SETUP
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. TABLES DEFINITION
-- ============================================

-- A. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER,
    sex TEXT,
    address TEXT,
    program TEXT,
    section TEXT,
    rfid_uid TEXT UNIQUE,
    role TEXT CHECK (role IN ('Student', 'Faculty', 'Staff', 'Visitor')),
    vehicle_type TEXT,
    vehicle_model TEXT,
    plate_number TEXT UNIQUE,
    vehicle_color TEXT,
    profile_image TEXT,
    drivers_license_image TEXT,
    id_front_image TEXT,
    id_back_image TEXT,
    motorcycle_image TEXT,
    authorization_status TEXT DEFAULT 'PENDING' CHECK (authorization_status IN ('PENDING', 'AUTHORIZED', 'DENIED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- B. PARKING SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.parking_slots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slot_number TEXT UNIQUE NOT NULL,
    slot_row TEXT NOT NULL DEFAULT 'TM',
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED')),
    current_vehicle TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- C. PARKING LOGS TABLE
CREATE TABLE IF NOT EXISTS public.parking_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rfid_uid TEXT NOT NULL,
    scan_type TEXT NOT NULL CHECK (scan_type IN ('ENTRY', 'EXIT')),
    status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'DENIED')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    parking_slot TEXT,
    guard_id UUID,
    remarks TEXT,
    visitor_name TEXT,
    is_emergency BOOLEAN DEFAULT FALSE
);

-- E. SPECIAL TAGS TABLE (Visitor & Emergency)
CREATE TABLE IF NOT EXISTS public.special_tags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    rfid_uid TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VISITOR', 'EMERGENCY')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- F. SYSTEM ACCOUNTS (RBAC)
CREATE TABLE IF NOT EXISTS public.system_accounts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT UNIQUE NOT NULL CHECK (role IN ('ADMIN', 'GUARD')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- G. DEVICES TABLE
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_location TEXT NOT NULL,
    esp32_identifier TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE')),
    last_online TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. SECURITY (RLS POLICIES)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_tags ENABLE ROW LEVEL SECURITY;

-- Create "Allow All" policies for anonymous access (Development Mode)
DROP POLICY IF EXISTS "Allow anon access users" ON public.users;
CREATE POLICY "Allow anon access users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access slots" ON public.parking_slots;
CREATE POLICY "Allow anon access slots" ON public.parking_slots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access logs" ON public.parking_logs;
CREATE POLICY "Allow anon access logs" ON public.parking_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access accounts" ON public.system_accounts;
CREATE POLICY "Allow anon access accounts" ON public.system_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access devices" ON public.devices;
CREATE POLICY "Allow anon access devices" ON public.devices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access special_tags" ON public.special_tags;
CREATE POLICY "Allow anon access special_tags" ON public.special_tags FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 4. REALTIME CONFIGURATION
-- ============================================

-- Ensure tables are tracked by Realtime
ALTER TABLE public.parking_slots REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.parking_logs REPLICA IDENTITY FULL;
ALTER TABLE public.special_tags REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Add tables to publication if not already present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'parking_slots') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_slots;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'parking_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_logs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'special_tags') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.special_tags;
    END IF;
END $$;

-- ============================================
-- 5. INITIAL SEED DATA
-- ============================================

-- Initial Slots (TM Building)
INSERT INTO public.parking_slots (slot_number, slot_row, status) VALUES
    ('TM01', 'TM', 'AVAILABLE'),
    ('TM02', 'TM', 'AVAILABLE'),
    ('TM03', 'TM', 'AVAILABLE'),
    ('TM04', 'TM', 'AVAILABLE'),
    ('TM05', 'TM', 'AVAILABLE'),
    ('TM06', 'TM', 'AVAILABLE'),
    ('TM07', 'TM', 'AVAILABLE'),
    ('TM08', 'TM', 'AVAILABLE'),
    ('TM09', 'TM', 'AVAILABLE'),
    ('TM10', 'TM', 'AVAILABLE')
ON CONFLICT (slot_number) DO NOTHING;

-- Default System Accounts
INSERT INTO public.system_accounts (username, password, role) VALUES
    ('guard', 'guard123', 'GUARD'),
    ('admin', 'admin123', 'ADMIN')
ON CONFLICT (username) DO NOTHING;
