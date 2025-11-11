-- Complete Admin Setup Script
-- Run this script to set up all admin functions for the admin panel
-- Make sure to replace 'your-admin@example.com' with your actual admin email

-- ============================================================================
-- STEP 1: Create Admin Email Configuration Table
-- ============================================================================
-- Since we can't use ALTER DATABASE in Supabase, we'll use a config table instead

-- Create config table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists, then create it
DROP POLICY IF EXISTS "Allow authenticated users to read admin config" ON public.admin_config;

-- Create policy to allow authenticated users to read
CREATE POLICY "Allow authenticated users to read admin config"
  ON public.admin_config FOR SELECT
  TO authenticated
  USING (true);

-- Insert or update admin email
INSERT INTO public.admin_config (key, value, updated_at)
VALUES ('admin_email', 'Adminssss@ayyappa.com', now())
ON CONFLICT (key) 
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ============================================================================
-- STEP 2: Create Helper Functions
-- ============================================================================

-- Function to get current user's email
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.admin_can()
RETURNS boolean AS $$
DECLARE
  user_email text;
  admin_email text;
BEGIN
  -- Get current user's email
  user_email := lower(coalesce(public.current_user_email(), ''));
  
  -- Get admin email from config table
  SELECT lower(value) INTO admin_email 
  FROM public.admin_config 
  WHERE key = 'admin_email' 
  LIMIT 1;
  
  -- Return true if emails match
  RETURN user_email != '' AND user_email = coalesce(admin_email, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

-- ============================================================================
-- STEP 3: Create Admin List Functions
-- ============================================================================

-- Pooja Bookings List
CREATE OR REPLACE FUNCTION public.admin_list_pooja_bookings(
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  sess text DEFAULT NULL,
  limit_rows int DEFAULT 200,
  offset_rows int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  date date,
  session text,
  user_id uuid,
  name text,
  email text,
  phone text,
  spouse_name text,
  children_names text,
  nakshatram text,
  gothram text
) AS $$
BEGIN
  IF NOT public.admin_can() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT b.id, b.created_at, b.date, b.session, b.user_id, b.name, b.email, b.phone,
           b.spouse_name, b.children_names, b.nakshatram, b.gothram
    FROM public."Pooja-Bookings" b
    WHERE (start_date IS NULL OR b.date >= start_date)
      AND (end_date IS NULL OR b.date <= end_date)
      AND (sess IS NULL OR b.session = sess)
    ORDER BY b.created_at DESC
    LIMIT coalesce(limit_rows, 200) OFFSET coalesce(offset_rows, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.admin_list_pooja_bookings(date, date, text, int, int) TO authenticated;

-- Annadanam Bookings List
CREATE OR REPLACE FUNCTION public.admin_list_annadanam_bookings(
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  sess text DEFAULT NULL,
  limit_rows int DEFAULT 500,
  offset_rows int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  date date,
  session text,
  user_id uuid,
  name text,
  email text,
  phone text,
  qty integer,
  status text,
  attended_at timestamptz
) AS $$
BEGIN
  IF NOT public.admin_can() THEN RETURN; END IF;
  RETURN QUERY
    SELECT b.id, b.created_at, b.date, b.session, b.user_id, b.name, b.email, b.phone, b.qty, b.status, b.attended_at
    FROM public."Bookings" b
    WHERE (start_date IS NULL OR b.date >= start_date)
      AND (end_date IS NULL OR b.date <= end_date)
      AND (sess IS NULL OR b.session = sess)
    ORDER BY b.created_at DESC
    LIMIT coalesce(limit_rows, 500) OFFSET coalesce(offset_rows, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.admin_list_annadanam_bookings(date, date, text, int, int) TO authenticated;

-- Donations List
CREATE OR REPLACE FUNCTION public.admin_list_donations(
  start_ts timestamptz DEFAULT NULL,
  end_ts timestamptz DEFAULT NULL,
  limit_rows int DEFAULT 500,
  offset_rows int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  name text,
  email text,
  phone text,
  address text,
  amount integer,
  storage_bucket text,
  storage_path text,
  pan_bucket text,
  pan_path text,
  status text,
  submitted_ip text,
  user_agent text
) AS $$
BEGIN
  IF NOT public.admin_can() THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.id, d.created_at, d.name, d.email, d.phone, d.address, d.amount,
           d.storage_bucket, d.storage_path, d.pan_bucket, d.pan_path,
           d.status, d.submitted_ip, d.user_agent
    FROM public.donations d
    WHERE (start_ts IS NULL OR d.created_at >= start_ts)
      AND (end_ts IS NULL OR d.created_at <= end_ts)
    ORDER BY d.created_at DESC
    LIMIT coalesce(limit_rows, 500) OFFSET coalesce(offset_rows, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.admin_list_donations(timestamptz, timestamptz, int, int) TO authenticated;

-- Contact Messages List
CREATE OR REPLACE FUNCTION public.admin_list_contact_us(
  start_ts timestamptz DEFAULT NULL,
  end_ts timestamptz DEFAULT NULL,
  limit_rows int DEFAULT 500,
  offset_rows int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  subject text,
  message text,
  status text
) AS $$
BEGIN
  IF NOT public.admin_can() THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.created_at, c.user_id, c.first_name, c.last_name, c.email, c.phone,
           c.subject, c.message, c.status
    FROM public."contact-us" c
    WHERE (start_ts IS NULL OR c.created_at >= start_ts)
      AND (end_ts IS NULL OR c.created_at <= end_ts)
    ORDER BY c.created_at DESC
    LIMIT coalesce(limit_rows, 500) OFFSET coalesce(offset_rows, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.admin_list_contact_us(timestamptz, timestamptz, int, int) TO authenticated;

-- Volunteer Bookings List
CREATE OR REPLACE FUNCTION public.admin_list_volunteer_bookings(
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  sess text DEFAULT NULL,
  limit_rows int DEFAULT 500,
  offset_rows int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  created_at timestamptz,
  name text,
  email text,
  phone text,
  date date,
  session text,
  role text,
  note text,
  user_id uuid
) AS $$
BEGIN
  IF NOT public.admin_can() THEN RETURN; END IF;
  RETURN QUERY
    SELECT v.id, v.created_at, v.name, v.email, v.phone, v.date, v.session, v.role, v.note, v.user_id
    FROM public."Volunteer Bookings" v
    WHERE (start_date IS NULL OR v.date >= start_date)
      AND (end_date IS NULL OR v.date <= end_date)
      AND (sess IS NULL OR v.session = sess)
    ORDER BY v.created_at DESC
    LIMIT coalesce(limit_rows, 500) OFFSET coalesce(offset_rows, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.admin_list_volunteer_bookings(date, date, text, int, int) TO authenticated;

-- ============================================================================
-- STEP 4: Verification Queries
-- ============================================================================

-- Verify all functions exist
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
        AND routine_name IN (
            'current_user_email',
            'admin_can',
            'admin_list_pooja_bookings',
            'admin_list_annadanam_bookings',
            'admin_list_donations',
            'admin_list_contact_us',
            'admin_list_volunteer_bookings'
        );
    
    IF func_count = 7 THEN
        RAISE NOTICE 'SUCCESS: All 7 admin functions are deployed correctly!';
    ELSE
        RAISE WARNING 'WARNING: Only % out of 7 functions found. Please check for errors above.', func_count;
    END IF;
END $$;

-- Show all deployed admin functions
SELECT 
    routine_name AS function_name,
    routine_type AS type,
    'Deployed' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name LIKE 'admin_%' OR routine_name = 'current_user_email'
ORDER BY routine_name;

-- Show current admin email setting
SELECT 
    CASE 
        WHEN value IS NOT NULL 
        THEN value
        ELSE 'NOT SET - Please update the INSERT statement at the top of this script!'
    END AS admin_email_configured
FROM public.admin_config
WHERE key = 'admin_email';

