-- =====================================================================
-- MemoryVault AI - migration 0001 (complete, safe to run more than once)
--
-- Creates: profiles, folders, documents, a private storage bucket,
-- Row Level Security (RLS) and the table permissions (GRANTs) users need.
--
-- WHY GRANTs ARE HERE:
-- RLS decides WHICH rows a user may touch, but the database role must
-- also be allowed to use the table at all. New Supabase projects do not
-- hand that out automatically, and without it you get
--   "permission denied for table folders".
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > New query > paste > Run.
-- It is idempotent: running it again on an existing database is fine.
-- =====================================================================

-- ---------------------------------------------------------------
-- Helper: keep updated_at fresh
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- profiles (one row per user, created automatically at sign up)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_language text not null default 'bn'
    check (preferred_language in ('bn', 'en')),
  -- External AI is OFF by default. Only the user can turn it on.
  allow_external_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only the database trigger may run this; nobody can call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill: accounts created before this migration ran get a profile too.
insert into public.profiles (id, display_name)
select u.id, nullif(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_user_id_idx on public.folders (user_id);
create index if not exists folders_parent_id_idx on public.folders (parent_id);

-- A policy on "folders" must not look inside "folders" itself: Postgres
-- stops with "infinite recursion detected in policy". This small helper
-- runs with elevated rights (SECURITY DEFINER), so the lookup skips RLS,
-- yet it still only answers "does THIS logged-in user own that folder?".
create or replace function public.owns_folder(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.folders
    where id = target and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_folder(uuid) from public, anon;
grant execute on function public.owns_folder(uuid) to authenticated;

alter table public.folders enable row level security;

drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own" on public.folders
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A parent folder must also belong to the same user (checked by owns_folder).
drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own" on public.folders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      parent_id is null
      or public.owns_folder(parent_id)
    )
  );

drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own" on public.folders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      parent_id is null
      or public.owns_folder(parent_id)
    )
  );

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own" on public.folders
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- documents (metadata only; the file itself lives in Storage)
-- ---------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  name text not null check (char_length(name) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  -- uploaded -> processing -> ready (or failed)
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  -- Identity documents (NID, passport...) are flagged so they are never
  -- sent to an external AI provider without explicit consent.
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_folder_id_idx on public.documents (folder_id);

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The folder must belong to the same user (owns_folder), and the file path must live
-- inside the user's own storage folder: "<user_id>/...".
drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and (
      folder_id is null
      or public.owns_folder(folder_id)
    )
  );

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and (
      folder_id is null
      or public.owns_folder(folder_id)
    )
  );

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- TABLE PERMISSIONS (GRANTs)
-- Logged-in users ("authenticated") get exactly what the app needs.
-- Logged-out visitors ("anon") get nothing at all.
-- ---------------------------------------------------------------
grant usage on schema public to authenticated;

-- profiles are created by the database trigger, so there is no INSERT here.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.documents to authenticated;

revoke all on public.profiles from anon;
revoke all on public.folders from anon;
revoke all on public.documents from anon;

-- ---------------------------------------------------------------
-- Private storage bucket for uploaded files (max 20 MB per file).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do update
  set public = false, file_size_limit = 20971520;

-- Files must be stored under "<user_id>/..." and only the owner can use them.
drop policy if exists "storage_documents_select_own" on storage.objects;
create policy "storage_documents_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "storage_documents_insert_own" on storage.objects;
create policy "storage_documents_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "storage_documents_update_own" on storage.objects;
create policy "storage_documents_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "storage_documents_delete_own" on storage.objects;
create policy "storage_documents_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
