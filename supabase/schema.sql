-- Snap Notes schema. Safe to run more than once in the Supabase SQL editor.

create table if not exists public.folders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.snaps (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_user_updated on public.folders (user_id, updated_at desc);
create index if not exists snaps_user_folder on public.snaps (user_id, folder_id, created_at desc);

alter table public.folders enable row level security;
alter table public.snaps enable row level security;

drop policy if exists "folders own" on public.folders;
create policy "folders own" on public.folders
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "snaps own" on public.snaps;
create policy "snaps own" on public.snaps
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.folders from anon;
revoke all on public.snaps from anon;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.snaps to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snap-photos', 'snap-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "snap photos read" on storage.objects;
create policy "snap photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'snap-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "snap photos insert" on storage.objects;
create policy "snap photos insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'snap-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "snap photos update" on storage.objects;
create policy "snap photos update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'snap-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'snap-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "snap photos delete" on storage.objects;
create policy "snap photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'snap-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
