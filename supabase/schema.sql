-- ============================================
-- CHARRMPARK Database Schema for Supabase
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. USERS TABLE (Extended for registration)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER,
    sex TEXT CHECK (sex IN ('Male', 'Female', 'Other')),
    address TEXT,
    role TEXT NOT NULL CHECK (role IN ('Student', 'Faculty', 'Staff', 'Visitor')),
    rfid_uid TEXT UNIQUE,
    program TEXT,
    section TEXT,
    vehicle_type TEXT,
    vehicle_model TEXT,
    plate_number TEXT,
    vehicle_color TEXT,
    profile_image TEXT,
    drivers_license_image TEXT,
    id_front_image TEXT,
    id_back_image TEXT,
    motorcycle_image TEXT,
    authorization_status TEXT DEFAULT 'PENDING' CHECK (authorization_status IN ('AUTHORIZED', 'DENIED', 'PENDING')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. PARKING SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.parking_slots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slot_number TEXT UNIQUE NOT NULL,
    slot_row TEXT NOT NULL DEFAULT 'TM',
    status TEXT DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED')),
    current_vehicle TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PARKING LOGS TABLE
CREATE TABLE IF NOT EXISTS public.parking_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id),
    rfid_uid TEXT NOT NULL,
    scan_type TEXT NOT NULL CHECK (scan_type IN ('ENTRY', 'EXIT')),
    status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'DENIED')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    parking_slot TEXT,
    guard_id UUID,
    remarks TEXT
);

-- 4. DEVICES TABLE (ESP32)
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_location TEXT NOT NULL,
    esp32_identifier TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE')),
    last_online TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Policies (permissive for prototype - tighten for production)
CREATE POLICY "Allow anon full access users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access slots" ON public.parking_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access logs" ON public.parking_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access devices" ON public.devices FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SEED PARKING SLOTS (TM Building - 10 Slots)
-- ============================================
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

-- ============================================
-- SEED DEFAULT ESP32 DEVICE
-- ============================================
INSERT INTO public.devices (device_name, device_location, esp32_identifier, status) VALUES
    ('Main Gate Scanner', 'TM Building Entrance', 'ESP32-CHARRMPARK-01', 'ONLINE')
ON CONFLICT (esp32_identifier) DO NOTHING;

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
