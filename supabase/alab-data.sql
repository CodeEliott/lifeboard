-- Appearance Lab's cloud copy, read by Lifeboard.
-- Run once in the SQL editor of RepLog's Supabase project (ref cokgmxsotavbstymslvc).
-- Safe to re-run: every statement is idempotent. It adds one table and touches nothing else.
--
-- Appearance Lab keeps its data in the browser. While RepLog is connected in the lab, it
-- upserts its whole state (`data`, photos excluded) and a small `summary` for Lifeboard into
-- this table, after each change. Lifeboard only ever selects `summary`.
-- Writer: appearance-lab/js/cloud.js. Reader: lifeboard/js/plugins/appearance-lab.js.

create table if not exists public.alab_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  summary    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each signed-in user can only reach the row with their own id.
alter table public.alab_data enable row level security;

drop policy if exists "alab_data: select own" on public.alab_data;
create policy "alab_data: select own" on public.alab_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "alab_data: insert own" on public.alab_data;
create policy "alab_data: insert own" on public.alab_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "alab_data: update own" on public.alab_data;
create policy "alab_data: update own" on public.alab_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "alab_data: delete own" on public.alab_data;
create policy "alab_data: delete own" on public.alab_data
  for delete to authenticated using (auth.uid() = user_id);

-- Nothing for signed-out visitors.
revoke all on public.alab_data from anon;
