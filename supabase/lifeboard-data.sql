-- Lifeboard's own storage: the board (layout, theme, items) and the files pinned on it.
-- Run once in the SQL editor of RepLog's Supabase project (ref cokgmxsotavbstymslvc).
-- Safe to re-run. It adds one table and one private bucket; nothing else is touched.
--
-- This is the only place Lifeboard writes. Plugins stay read-only towards other apps.
-- Writer and reader: lifeboard/js/board/sync.js (table) and js/board/assets.js (files).

create table if not exists public.lifeboard_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  board      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lifeboard_data enable row level security;

drop policy if exists "lifeboard_data: select own" on public.lifeboard_data;
create policy "lifeboard_data: select own" on public.lifeboard_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "lifeboard_data: insert own" on public.lifeboard_data;
create policy "lifeboard_data: insert own" on public.lifeboard_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "lifeboard_data: update own" on public.lifeboard_data;
create policy "lifeboard_data: update own" on public.lifeboard_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lifeboard_data: delete own" on public.lifeboard_data;
create policy "lifeboard_data: delete own" on public.lifeboard_data
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.lifeboard_data from anon;

-- Photos, wallpapers and uploaded fonts. Private: files are stored under "<user_id>/..."
-- and only that user can read or write them. 5 MB per file; the app shrinks photos first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lifeboard', 'lifeboard', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/octet-stream'])
on conflict (id) do nothing;

drop policy if exists "lifeboard files: owner all" on storage.objects;
create policy "lifeboard files: owner all" on storage.objects
  for all to authenticated
  using (bucket_id = 'lifeboard' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'lifeboard' and auth.uid()::text = (storage.foldername(name))[1]);
