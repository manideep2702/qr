-- Admin helpers and RPC to list Pooja-Bookings for admin usage
-- Note: Admin email is now stored in public.admin_config table
-- Run admin_setup_complete.sql to set up the admin configuration

create or replace function public.current_user_email()
returns text as $$
  select email from auth.users where id = auth.uid();
$$ language sql stable security definer set search_path = public, auth;

create or replace function public.admin_can()
returns boolean as $$
declare
  user_email text;
  admin_email text;
begin
  -- Get current user's email
  user_email := lower(coalesce(public.current_user_email(), ''));
  
  -- Get admin email from config table
  select lower(value) into admin_email 
  from public.admin_config 
  where key = 'admin_email' 
  limit 1;
  
  -- Return true if emails match
  return user_email != '' and user_email = coalesce(admin_email, '');
end;
$$ language plpgsql stable security definer set search_path = public, auth;

create or replace function public.admin_list_pooja_bookings(
  start_date date default null,
  end_date date default null,
  sess text default null,
  limit_rows int default 200,
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
  spouse_name text,
  children_names text,
  nakshatram text,
  gothram text,
  attended_at timestamptz
) as $$
begin
  if not public.admin_can() then
    return;
  end if;
  return query
    select b.id, b.created_at, b.date, b.session, b.user_id, b.name, b.email, b.phone,
           b.spouse_name, b.children_names, b.nakshatram, b.gothram, b.attended_at
    from public."Pooja-Bookings" b
    where (start_date is null or b.date >= start_date)
      and (end_date is null or b.date <= end_date)
      and (sess is null or b.session = sess)
    order by b.created_at desc
    limit coalesce(limit_rows, 200) offset coalesce(offset_rows, 0);
end;
$$ language plpgsql security definer set search_path = public, auth;

grant execute on function public.admin_list_pooja_bookings(date, date, text, int, int) to authenticated;


