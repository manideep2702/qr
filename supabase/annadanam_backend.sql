-- Annadanam backend aligned to existing "Bookings" table
-- Run this in Supabase SQL editor once

-- Create a canonical Slots table tracking capacity by date/session
CREATE TABLE IF NOT EXISTS public."Slots" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  session text NOT NULL,
  capacity integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  CONSTRAINT slots_unique UNIQUE (date, session)
);

-- Drop legacy constraint if it exists (from Morning/Evening only)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public."Slots" DROP CONSTRAINT IF EXISTS slots_session_check;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    ALTER TABLE public."Slots" DROP CONSTRAINT IF EXISTS "Slots_session_check";
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

ALTER TABLE public."Slots" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY slots_select_public ON public."Slots"
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN
  -- policy already exists
  NULL;
END $$;

-- Enforce season window on Slots (Nov 5 to Jan 7 inclusive)
DO $$
BEGIN
  -- Recreate constraint with current season
  BEGIN
    ALTER TABLE public."Slots" DROP CONSTRAINT IF EXISTS slots_date_in_season;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  -- Clean up any legacy rows outside the allowed window to avoid constraint failure
  DELETE FROM public."Slots"
  WHERE NOT (
    (date >= DATE '2025-11-05' AND date <= DATE '2026-01-07')
    OR date = DATE '2025-10-31'
  );
  ALTER TABLE public."Slots"
    ADD CONSTRAINT slots_date_in_season
    CHECK (
      (date >= DATE '2025-11-05' AND date <= DATE '2026-01-07')
      OR date = DATE '2025-10-31'
    );
END $$;

-- Ensure Bookings table exists (you said it already exists)
CREATE TABLE IF NOT EXISTS public."Bookings" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Ensure required columns exist on Bookings
ALTER TABLE public."Bookings"
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS session text,
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed';

-- Add/upgrade QR + attendance tracking on Bookings
DO $$
BEGIN
  BEGIN
    ALTER TABLE public."Bookings" ADD COLUMN IF NOT EXISTS qr_token uuid;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  UPDATE public."Bookings" SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;
  -- ensure future inserts get an automatic token
  BEGIN
    ALTER TABLE public."Bookings" ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public."Bookings" ALTER COLUMN qr_token SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_qr_token_idx ON public."Bookings"(qr_token);
  EXCEPTION WHEN duplicate_table THEN NULL; END;
  BEGIN
    ALTER TABLE public."Bookings" ADD COLUMN IF NOT EXISTS attended_at timestamptz;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Enforce season window on Bookings as a safety net
DO $$
BEGIN
  BEGIN
    ALTER TABLE public."Bookings" DROP CONSTRAINT IF EXISTS bookings_date_in_season;
  EXCEPTION WHEN undefined_object THEN NULL; END;
  -- Clean up legacy bookings outside allowed window to avoid constraint failure
  DELETE FROM public."Bookings"
  WHERE date IS NOT NULL AND NOT (
    (date >= DATE '2025-11-05' AND date <= DATE '2026-01-07')
    OR date = DATE '2025-10-31'
  );
  ALTER TABLE public."Bookings"
    ADD CONSTRAINT bookings_date_in_season
    CHECK (
      (date >= DATE '2025-11-05' AND date <= DATE '2026-01-07')
      OR date = DATE '2025-10-31'
    );
END $$;

-- Helpful unique index to prevent double booking per user (allows NULL user_id)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_per_user_idx
  ON public."Bookings" (date, session, user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public."Bookings" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY bookings_select_own ON public."Bookings"
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY bookings_insert_own ON public."Bookings"
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY bookings_update_own ON public."Bookings"
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY bookings_select_service ON public."Bookings"
    FOR SELECT TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper view to compute booked_count per date/session
CREATE OR REPLACE VIEW public.slot_booked_counts AS
SELECT
  b.date,
  b.session,
  COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.qty ELSE 0 END), 0)::int AS booked_count
FROM public."Bookings" b
GROUP BY b.date, b.session;

-- RPC to list slots with remaining counts for a given date
CREATE OR REPLACE FUNCTION public.get_annadanam_slots(d date)
RETURNS TABLE (
  date date,
  session text,
  capacity integer,
  booked_count integer,
  remaining integer,
  status text
) AS $$
BEGIN
  -- Return empty set if out of season window
  IF NOT (d BETWEEN DATE '2025-11-05' AND DATE '2026-01-07'
          OR d = DATE '2025-10-31') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.date,
         s.session,
         s.capacity,
         COALESCE(c.booked_count, 0) AS booked_count,
         GREATEST(s.capacity - COALESCE(c.booked_count, 0), 0) AS remaining,
         s.status
  FROM public."Slots" s
  LEFT JOIN public.slot_booked_counts c
    ON c.date = s.date AND c.session = s.session
  WHERE s.date = d
    AND s.session IN (
      '1:00 PM - 1:30 PM',
      '1:30 PM - 2:00 PM',
      '2:00 PM - 2:30 PM',
      '2:30 PM - 3:00 PM',
      '8:00 PM - 8:30 PM',
      '8:30 PM - 9:00 PM',
      '9:00 PM - 9:30 PM',
      '9:30 PM - 10:00 PM'
    )
  ORDER BY CASE s.session
    WHEN '1:00 PM - 1:30 PM' THEN 1
    WHEN '1:30 PM - 2:00 PM' THEN 2
    WHEN '2:00 PM - 2:30 PM' THEN 3
    WHEN '2:30 PM - 3:00 PM' THEN 4
    WHEN '8:00 PM - 8:30 PM' THEN 5
    WHEN '8:30 PM - 9:00 PM' THEN 6
    WHEN '9:00 PM - 9:30 PM' THEN 7
    WHEN '9:30 PM - 10:00 PM' THEN 8
    ELSE 999 END;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC to reserve booking by date/session (atomic capacity check)
CREATE OR REPLACE FUNCTION public.reserve_annadanam_by_date(
  d date,
  s text,
  user_id uuid,
  name text,
  email text,
  phone text,
  qty integer
)
RETURNS public."Bookings" AS $$
DECLARE
  slot_rec RECORD;
  booked int;
  new_row public."Bookings";
  start_local time;
  end_local time;
  start_at timestamptz;
  last_start timestamptz;
  group_total int := 0;
  is_afternoon boolean := false;
  now_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  now_ist_time time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
BEGIN
  -- Enforce season window
  IF NOT (d BETWEEN DATE '2025-11-05' AND DATE '2026-01-07'
          OR d = DATE '2025-10-31') THEN
    RAISE EXCEPTION 'Out of Annadanam season';
  END IF;
  IF qty IS NULL OR qty <> 1 THEN
    RAISE EXCEPTION 'Only 1 person per booking';
  END IF;
  IF email IS NULL OR length(trim(email)) = 0 THEN
    RAISE EXCEPTION 'Email required';
  END IF;
  -- Resolve fixed session times
  IF s = '1:00 PM - 1:30 PM' THEN start_local := time '13:00'; end_local := time '13:30';
  ELSIF s = '1:30 PM - 2:00 PM' THEN start_local := time '13:30'; end_local := time '14:00';
  ELSIF s = '2:00 PM - 2:30 PM' THEN start_local := time '14:00'; end_local := time '14:30';
  ELSIF s = '2:30 PM - 3:00 PM' THEN start_local := time '14:30'; end_local := time '15:00';
  ELSIF s = '8:00 PM - 8:30 PM' THEN start_local := time '20:00'; end_local := time '20:30';
  ELSIF s = '8:30 PM - 9:00 PM' THEN start_local := time '20:30'; end_local := time '21:00';
  ELSIF s = '9:00 PM - 9:30 PM' THEN start_local := time '21:00'; end_local := time '21:30';
  ELSIF s = '9:30 PM - 10:00 PM' THEN start_local := time '21:30'; end_local := time '22:00';
  ELSE
    RAISE EXCEPTION 'Invalid session label';
  END IF;

  -- Build absolute timestamps in IST (+05:30)
  start_at := (d::text || ' ' || start_local::text || '+05:30')::timestamptz;
  last_start := (d::text || ' 21:30+05:30')::timestamptz; -- last session start

  -- Enforce daily booking windows (IST):
  -- Afternoon sessions: 05:00–11:30 IST
  -- Evening sessions:   15:00–19:30 IST
  -- Also block once the session has started
  -- Block if session already started (based on IST)
  IF (now() AT TIME ZONE 'Asia/Kolkata') >= start_at AT TIME ZONE 'Asia/Kolkata' THEN
    RAISE EXCEPTION 'Slot already started';
  END IF;
  -- Time-of-day gating
  IF s = ANY (ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']) THEN
    IF NOT (now_ist_time >= time '05:00' AND now_ist_time <= time '11:30') THEN
      RAISE EXCEPTION 'Booking allowed 05:00–11:30 IST for afternoon sessions';
    END IF;
  ELSE
    IF NOT (now_ist_time >= time '15:00' AND now_ist_time <= time '19:30') THEN
      RAISE EXCEPTION 'Booking allowed 15:00–19:30 IST for evening sessions';
    END IF;
  END IF;

  SELECT * INTO slot_rec FROM public."Slots" WHERE date = d AND session = s FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;
  IF slot_rec.status <> 'open' THEN
    RAISE EXCEPTION 'Slot is closed';
  END IF;
  -- Determine session group and enforce per-day group cap (Afternoon 150, Evening 150)
  is_afternoon := s = ANY (ARRAY[
    '1:00 PM - 1:30 PM',
    '1:30 PM - 2:00 PM',
    '2:00 PM - 2:30 PM',
    '2:30 PM - 3:00 PM'
  ]);
  -- Lock all slots for this group to serialize concurrent reservations across batches
  PERFORM 1 FROM public."Slots"
      WHERE date = d AND session = ANY (
        CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
             ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
      )
      FOR UPDATE;
  SELECT COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.qty ELSE 0 END), 0)
    INTO group_total
    FROM public."Bookings" AS b
    WHERE b.date = d AND b.session = ANY (
      CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
           ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
    );
  IF group_total + qty > 150 THEN
    RAISE EXCEPTION 'Session full';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.qty ELSE 0 END), 0)
    INTO booked
    FROM public."Bookings" AS b
    WHERE b.date = d AND b.session = s;
  IF booked + qty > slot_rec.capacity THEN
    RAISE EXCEPTION 'Slot full';
  END IF;
  INSERT INTO public."Bookings" (date, session, user_id, name, email, phone, qty)
  VALUES (d, s, user_id, name, email, phone, qty)
  RETURNING * INTO new_row;
  -- Auto-close slot when capacity reached
  IF (booked + qty) >= slot_rec.capacity THEN
    UPDATE public."Slots" SET status = 'closed' WHERE date = d AND session = s;
  END IF;
  -- Auto-close the entire session group when group cap reached
  IF (group_total + qty) >= 150 THEN
    UPDATE public."Slots"
      SET status = 'closed'
      WHERE date = d AND session = ANY (
        CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
             ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
      );
  END IF;
  RETURN new_row;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'You already booked this session';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- DEV-ONLY: RPC to reserve with time override (granted only to service_role)
CREATE OR REPLACE FUNCTION public.reserve_annadanam_by_date_dev(
  d date,
  s text,
  user_id uuid,
  name text,
  email text,
  phone text,
  qty integer,
  dev_time text DEFAULT NULL
)
RETURNS public."Bookings" AS $$
DECLARE
  slot_rec RECORD;
  booked int;
  new_row public."Bookings";
  start_local time;
  end_local time;
  start_at timestamptz;
  last_start timestamptz;
  group_total int := 0;
  is_afternoon boolean := false;
  now_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  now_ist_time time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
BEGIN
  -- Optional developer override for time-of-day gating
  IF dev_time IS NOT NULL THEN
    BEGIN
      now_ist_time := (dev_time)::time;
    EXCEPTION WHEN others THEN
      -- ignore invalid dev_time; keep actual time
      now_ist_time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    END;
  END IF;

  -- Enforce season window
  IF NOT (d BETWEEN DATE '2025-11-05' AND DATE '2026-01-07'
          OR d = DATE '2025-10-31') THEN
    RAISE EXCEPTION 'Out of Annadanam season';
  END IF;
  IF qty IS NULL OR qty <> 1 THEN
    RAISE EXCEPTION 'Only 1 person per booking';
  END IF;
  IF email IS NULL OR length(trim(email)) = 0 THEN
    RAISE EXCEPTION 'Email required';
  END IF;
  -- Resolve fixed session times
  IF s = '1:00 PM - 1:30 PM' THEN start_local := time '13:00'; end_local := time '13:30';
  ELSIF s = '1:30 PM - 2:00 PM' THEN start_local := time '13:30'; end_local := time '14:00';
  ELSIF s = '2:00 PM - 2:30 PM' THEN start_local := time '14:00'; end_local := time '14:30';
  ELSIF s = '2:30 PM - 3:00 PM' THEN start_local := time '14:30'; end_local := time '15:00';
  ELSIF s = '8:00 PM - 8:30 PM' THEN start_local := time '20:00'; end_local := time '20:30';
  ELSIF s = '8:30 PM - 9:00 PM' THEN start_local := time '20:30'; end_local := time '21:00';
  ELSIF s = '9:00 PM - 9:30 PM' THEN start_local := time '21:00'; end_local := time '21:30';
  ELSIF s = '9:30 PM - 10:00 PM' THEN start_local := time '21:30'; end_local := time '22:00';
  ELSE
    RAISE EXCEPTION 'Invalid session label';
  END IF;

  -- Build absolute timestamps in IST (+05:30)
  start_at := (d::text || ' ' || start_local::text || '+05:30')::timestamptz;
  last_start := (d::text || ' 21:30+05:30')::timestamptz; -- last session start

  -- Block if session already started (based on real current time)
  IF (now() AT TIME ZONE 'Asia/Kolkata') >= start_at AT TIME ZONE 'Asia/Kolkata' THEN
    RAISE EXCEPTION 'Slot already started';
  END IF;
  -- Time-of-day gating using override if provided
  IF s = ANY (ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']) THEN
    IF NOT (now_ist_time >= time '11:00' AND now_ist_time <= time '11:30') THEN
      RAISE EXCEPTION 'Booking allowed 11:00–11:30 IST for afternoon sessions';
    END IF;
  ELSE
    IF NOT (now_ist_time >= time '15:00' AND now_ist_time <= time '19:30') THEN
      RAISE EXCEPTION 'Booking allowed 15:00–19:30 IST for evening sessions';
    END IF;
  END IF;

  SELECT * INTO slot_rec FROM public."Slots" WHERE date = d AND session = s FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;
  IF slot_rec.status <> 'open' THEN
    RAISE EXCEPTION 'Slot is closed';
  END IF;
  -- Determine session group and enforce per-day group cap (Afternoon 150, Evening 150)
  is_afternoon := s = ANY (ARRAY[
    '1:00 PM - 1:30 PM',
    '1:30 PM - 2:00 PM',
    '2:00 PM - 2:30 PM',
    '2:30 PM - 3:00 PM'
  ]);
  -- Lock all slots for this group to serialize concurrent reservations across batches
  PERFORM 1 FROM public."Slots"
      WHERE date = d AND session = ANY (
        CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
             ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
      )
      FOR UPDATE;
  SELECT COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.qty ELSE 0 END), 0)
    INTO group_total
    FROM public."Bookings" AS b
    WHERE b.date = d AND b.session = ANY (
      CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
           ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
    );
  IF group_total + qty > 150 THEN
    RAISE EXCEPTION 'Session full';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.qty ELSE 0 END), 0)
    INTO booked
    FROM public."Bookings" AS b
    WHERE b.date = d AND b.session = s;
  IF booked + qty > slot_rec.capacity THEN
    RAISE EXCEPTION 'Slot full';
  END IF;
  INSERT INTO public."Bookings" (date, session, user_id, name, email, phone, qty)
  VALUES (d, s, user_id, name, email, phone, qty)
  RETURNING * INTO new_row;
  -- Auto-close slot when capacity reached
  IF (booked + qty) >= slot_rec.capacity THEN
    UPDATE public."Slots" SET status = 'closed' WHERE date = d AND session = s;
  END IF;
  -- Auto-close the entire session group when group cap reached
  IF (group_total + qty) >= 150 THEN
    UPDATE public."Slots"
      SET status = 'closed'
      WHERE date = d AND session = ANY (
        CASE WHEN is_afternoon THEN ARRAY['1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM']
             ELSE ARRAY['8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'] END
      );
  END IF;
  RETURN new_row;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'You already booked this session';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Ensure RPCs are callable from API roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_annadanam_slots(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_annadanam_by_date(date, text, uuid, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_annadanam_by_date_dev(date, text, uuid, text, text, text, integer, text) TO service_role;

-- Public read of pass details by token (for static export)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.lookup_annadanam_pass(token uuid)
  RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    date date,
    session text,
    name text,
    email text,
    phone text,
    qty int,
    status text,
    attended_at timestamptz
  ) AS $$
    SELECT id, created_at, date, session, name, email, phone, qty, status, attended_at
    FROM public."Bookings"
    WHERE qr_token = token
  $$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
EXCEPTION WHEN others THEN NULL; END $$;

GRANT EXECUTE ON FUNCTION public.lookup_annadanam_pass(uuid) TO anon, authenticated;

-- Public mark attendance by token (security definer)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.mark_annadanam_attended(token uuid)
  RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    date date,
    session text,
    name text,
    email text,
    phone text,
    qty int,
    status text,
    attended_at timestamptz
  ) AS $$
  DECLARE
    updated public."Bookings";
  BEGIN
    UPDATE public."Bookings"
      SET attended_at = now()
      WHERE qr_token = token AND attended_at IS NULL
      RETURNING * INTO updated;
    IF updated.id IS NULL THEN
      -- Either invalid token or already marked; return the current row for clarity
      SELECT * INTO updated FROM public."Bookings" WHERE qr_token = token LIMIT 1;
    END IF;
    RETURN QUERY SELECT
      updated.id, updated.created_at, updated.date, updated.session, updated.name, updated.email,
      updated.phone, updated.qty, updated.status, updated.attended_at;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
EXCEPTION WHEN others THEN NULL; END $$;

GRANT EXECUTE ON FUNCTION public.mark_annadanam_attended(uuid) TO anon, authenticated; 

-- Optional: seed Slots for the 2025-11-05 to 2026-01-07 season
-- Run once; safe to re-run (uses ON CONFLICT DO NOTHING)
DO $$
DECLARE
  v_date date := DATE '2025-11-05';
BEGIN
  WHILE v_date <= DATE '2026-01-07' LOOP
    -- Afternoon sessions
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '1:00 PM - 1:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '1:30 PM - 2:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '2:00 PM - 2:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '2:30 PM - 3:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    -- Evening sessions
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '8:00 PM - 8:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '8:30 PM - 9:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '9:00 PM - 9:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (v_date, '9:30 PM - 10:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    v_date := v_date + INTERVAL '1 day';
  END LOOP;
  -- Extra special date outside main window (31-Oct-2025)
  PERFORM 1;
  IF NOT EXISTS (
    SELECT 1 FROM public."Slots" WHERE date = DATE '2025-10-31'
  ) THEN
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '1:00 PM - 1:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '1:30 PM - 2:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '2:00 PM - 2:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '2:30 PM - 3:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '8:00 PM - 8:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '8:30 PM - 9:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '9:00 PM - 9:30 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
    INSERT INTO public."Slots" (date, session, capacity, status) VALUES (DATE '2025-10-31', '9:30 PM - 10:00 PM', 40, 'open') ON CONFLICT (date, session) DO NOTHING;
  END IF;
  -- Ensure all seeded/legacy slots use capacity 40 per time slot
  UPDATE public."Slots"
    SET capacity = 40
    WHERE (date BETWEEN DATE '2025-11-05' AND DATE '2026-01-07' OR date = DATE '2025-10-31')
      AND session IN (
        '1:00 PM - 1:30 PM','1:30 PM - 2:00 PM','2:00 PM - 2:30 PM','2:30 PM - 3:00 PM',
        '8:00 PM - 8:30 PM','8:30 PM - 9:00 PM','9:00 PM - 9:30 PM','9:30 PM - 10:00 PM'
      );
END $$;
