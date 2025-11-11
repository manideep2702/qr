-- Admin listing RPCs for multiple datasets. Requires admin_can() from pooja_admin.sql

-- Annadanam bookings list
create or replace function public.admin_list_annadanam_bookings(
  start_date date default null,
  end_date date default null,
  sess text default null,
  limit_rows int default 500,
  offset_rows int default 0
)
returns table (
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
) as $$
begin
  if not public.admin_can() then return; end if;
  return query
    select b.id, b.created_at, b.date, b.session, b.user_id, b.name, b.email, b.phone, b.qty, b.status, b.attended_at
    from public."Bookings" b
    where (start_date is null or b.date >= start_date)
      and (end_date is null or b.date <= end_date)
      and (sess is null or b.session = sess)
    order by b.created_at desc
    limit coalesce(limit_rows, 500) offset coalesce(offset_rows, 0);
end;
$$ language plpgsql security definer set search_path=public, auth;

grant execute on function public.admin_list_annadanam_bookings(date, date, text, int, int) to authenticated;

-- Donations list
create or replace function public.admin_list_donations(
  start_ts timestamptz default null,
  end_ts timestamptz default null,
  limit_rows int default 500,
  offset_rows int default 0
)
returns table (
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
) as $$
begin
  if not public.admin_can() then return; end if;
  return query
    select d.id, d.created_at, d.name, d.email, d.phone, d.address, d.amount,
           d.storage_bucket, d.storage_path, d.pan_bucket, d.pan_path,
           d.status, d.submitted_ip, d.user_agent
    from public.donations d
    where (start_ts is null or d.created_at >= start_ts)
      and (end_ts is null or d.created_at <= end_ts)
    order by d.created_at desc
    limit coalesce(limit_rows, 500) offset coalesce(offset_rows, 0);
end;
$$ language plpgsql security definer set search_path=public, auth;

grant execute on function public.admin_list_donations(timestamptz, timestamptz, int, int) to authenticated;

-- Contact messages list
create or replace function public.admin_list_contact_us(
  start_ts timestamptz default null,
  end_ts timestamptz default null,
  limit_rows int default 500,
  offset_rows int default 0
)
returns table (
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
) as $$
begin
  if not public.admin_can() then return; end if;
  return query
    select c.id, c.created_at, c.user_id, c.first_name, c.last_name, c.email, c.phone,
           c.subject, c.message, c.status
    from public."contact-us" c
    where (start_ts is null or c.created_at >= start_ts)
      and (end_ts is null or c.created_at <= end_ts)
    order by c.created_at desc
    limit coalesce(limit_rows, 500) offset coalesce(offset_rows, 0);
end;
$$ language plpgsql security definer set search_path=public, auth;

grant execute on function public.admin_list_contact_us(timestamptz, timestamptz, int, int) to authenticated;

-- Volunteer bookings list
create or replace function public.admin_list_volunteer_bookings(
  start_date date default null,
  end_date date default null,
  sess text default null,
  limit_rows int default 500,
  offset_rows int default 0
)
returns table (
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
) as $$
begin
  if not public.admin_can() then return; end if;
  return query
    select v.id, v.created_at, v.name, v.email, v.phone, v.date, v.session, v.role, v.note, v.user_id
    from public."Volunteer Bookings" v
    where (start_date is null or v.date >= start_date)
      and (end_date is null or v.date <= end_date)
      and (sess is null or v.session = sess)
    order by v.created_at desc
    limit coalesce(limit_rows, 500) offset coalesce(offset_rows, 0);
end;
$$ language plpgsql security definer set search_path=public, auth;

grant execute on function public.admin_list_volunteer_bookings(date, date, text, int, int) to authenticated;


