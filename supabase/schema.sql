-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists public.ipos (
  id bigint generated always as identity primary key,
  name text not null unique,
  type text not null default 'Mainboard' check (type in ('Mainboard','SME')),
  open_date date,
  close_date date,
  price_low numeric,
  price_high numeric,
  lot integer,
  issue_size_cr numeric,
  gmp numeric default 0,
  gmp_heard text,
  allotment_date date,
  listing_date date,
  registrar text,
  sub_retail numeric default 0,
  sub_nii numeric default 0,
  sub_qib numeric default 0,
  drhp_url text,
  anchor_url text,
  allotment_out boolean,
  updated_at timestamptz not null default now()
);

alter table public.ipos enable row level security;
drop policy if exists "public read" on public.ipos;
create policy "public read" on public.ipos for select using (true);
-- No insert/update policy on purpose: only you (Table Editor / service role) can change data.

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ipos_touch on public.ipos;
create trigger ipos_touch before update on public.ipos for each row execute function public.touch_updated_at();

-- Instant updates in the app (Realtime)
alter publication supabase_realtime add table public.ipos;

-- ===== Sync accounts and bids between phones (one row per user) =====
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
drop policy if exists "own select" on public.user_data;
drop policy if exists "own insert" on public.user_data;
drop policy if exists "own update" on public.user_data;
drop policy if exists "own delete" on public.user_data;
create policy "own select" on public.user_data for select using (auth.uid() = user_id);
create policy "own insert" on public.user_data for insert with check (auth.uid() = user_id);
create policy "own update" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.user_data for delete using (auth.uid() = user_id);
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data for each row execute function public.touch_updated_at();
alter publication supabase_realtime add table public.user_data;
