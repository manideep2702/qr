-- Pooja Booking table and policies
-- Booking window: 2025-11-05 to 2026-01-07 (inclusive)
-- Sessions: '10:30 AM', '6:30 PM'

create table if not exists public."Pooja-Bookings" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  session text not null check (session in ('10:30 AM','6:30 PM')),
  user_id uuid null references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text null,
  -- New mandatory/optional devotional details
  spouse_name text not null default '' check (length(btrim(spouse_name)) > 0),
  children_names text null,
  nakshatram text not null default '' check (length(btrim(nakshatram)) > 0),
  gothram text not null default '' check (length(btrim(gothram)) > 0),
  amount numeric null,
  utr text null,
  -- QR and attendance
  qr_token uuid not null default gen_random_uuid(),
  attended_at timestamptz null
);

-- Enforce booking window at the database layer as well
do $$
begin
  begin
    alter table public."Pooja-Bookings" drop constraint if exists pooja_date_window;
  exception when undefined_object then null; end;
  alter table public."Pooja-Bookings"
    add constraint pooja_date_window
    check (date between date '2025-11-05' and date '2026-01-07');
end $$;

-- Add/upgrade new columns if the table already existed previously
do $$
begin
  -- spouse_name (required, non-blank)
  begin
    alter table public."Pooja-Bookings" add column if not exists spouse_name text;
  exception when duplicate_column then null; end;
  update public."Pooja-Bookings" set spouse_name = coalesce(nullif(btrim(spouse_name), ''),'Unknown') where spouse_name is null or btrim(spouse_name) = '';
  begin
    alter table public."Pooja-Bookings" alter column spouse_name set not null;
  exception when others then null; end;
  begin
    alter table public."Pooja-Bookings" drop constraint if exists pooja_spouse_nonblank;
  exception when undefined_object then null; end;
  alter table public."Pooja-Bookings" add constraint pooja_spouse_nonblank check (length(btrim(spouse_name)) > 0);

  -- children_names (optional)
  begin
    alter table public."Pooja-Bookings" add column if not exists children_names text;
  exception when duplicate_column then null; end;

  -- nakshatram (required, non-blank)
  begin
    alter table public."Pooja-Bookings" add column if not exists nakshatram text;
  exception when duplicate_column then null; end;
  update public."Pooja-Bookings" set nakshatram = coalesce(nullif(btrim(nakshatram), ''),'Unknown') where nakshatram is null or btrim(nakshatram) = '';
  begin
    alter table public."Pooja-Bookings" alter column nakshatram set not null;
  exception when others then null; end;
  begin
    alter table public."Pooja-Bookings" drop constraint if exists pooja_nakshatram_nonblank;
  exception when undefined_object then null; end;
  alter table public."Pooja-Bookings" add constraint pooja_nakshatram_nonblank check (length(btrim(nakshatram)) > 0);

  -- gothram (required, non-blank)
  begin
    alter table public."Pooja-Bookings" add column if not exists gothram text;
  exception when duplicate_column then null; end;
  update public."Pooja-Bookings" set gothram = coalesce(nullif(btrim(gothram), ''),'Unknown') where gothram is null or btrim(gothram) = '';
  begin
    alter table public."Pooja-Bookings" alter column gothram set not null;
  exception when others then null; end;
  begin
    alter table public."Pooja-Bookings" drop constraint if exists pooja_gothram_nonblank;
  exception when undefined_object then null; end;
  alter table public."Pooja-Bookings" add constraint pooja_gothram_nonblank check (length(btrim(gothram)) > 0);

  -- amount (optional)
  begin
    alter table public."Pooja-Bookings" add column if not exists amount numeric;
  exception when duplicate_column then null; end;

  -- utr (optional)
  begin
    alter table public."Pooja-Bookings" add column if not exists utr text;
  exception when duplicate_column then null; end;

  -- qr_token and attended_at
  begin
    alter table public."Pooja-Bookings" add column if not exists qr_token uuid;
  exception when duplicate_column then null; end;
  update public."Pooja-Bookings" set qr_token = gen_random_uuid() where qr_token is null;
  begin
    alter table public."Pooja-Bookings" alter column qr_token set not null;
  exception when others then null; end;
  begin
    create unique index if not exists pooja_qr_token_idx on public."Pooja-Bookings"(qr_token);
  exception when duplicate_table then null; end;
  begin
    alter table public."Pooja-Bookings" add column if not exists attended_at timestamptz;
  exception when duplicate_column then null; end;
end $$;

alter table public."Pooja-Bookings" enable row level security;

do $$
begin
  create policy pooja_select_own on public."Pooja-Bookings"
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy pooja_insert_own on public."Pooja-Bookings"
    for insert to authenticated with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy pooja_service_select on public."Pooja-Bookings"
    for select to service_role using (true);
exception when duplicate_object then null; end $$;
