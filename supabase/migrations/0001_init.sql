-- MemoryVault AI - migration 0001: profiles, folders, documents, private storage.
-- Every table uses Row Level Security (RLS): a user can only touch their own rows.
-- Safe to run once in: Supabase Dashboard > SQL Editor.

-- ---------------------------------------------------------------
-- Extensions (pgvector is used later for semantic search)
-- ---------------------------------------------------------------
create extension if not exists vector with schema extensions;

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
-- profiles (one row per user)
-- ---------------------------------------------------------------
create table public.profiles (
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

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index folders_user_id_idx on public.folders (user_id);
create index folders_parent_id_idx on public.folders (parent_id);

alter table public.folders enable row level security;

create policy "folders_select_own" on public.folders
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A parent folder must also belong to the same user.
create policy "folders_insert_own" on public.folders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      parent_id is null
      or exists (
        select 1 from public.folders p
        where p.id = parent_id and p.user_id = (select auth.uid())
      )
    )
  );

create policy "folders_update_own" on public.folders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      parent_id is null
      or exists (
        select 1 from public.folders p
        where p.id = parent_id and p.user_id = (select auth.uid())
      )
    )
  );

create policy "folders_delete_own" on public.folders
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- documents (metadata; the file itself lives in Storage)
-- ---------------------------------------------------------------
create table public.documents (
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

create index documents_user_id_idx on public.documents (user_id);
create index documents_folder_id_idx on public.documents (folder_id);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The folder must belong to the same user, and the file path must live
-- inside the user's own storage folder: "<user_id>/...".
create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and (
      folder_id is null
      or exists (
        select 1 from public.folders f
        where f.id = folder_id and f.user_id = (select auth.uid())
      )
    )
  );

create policy "documents_update_own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and (
      folder_id is null
      or exists (
        select 1 from public.folders f
        where f.id = folder_id and f.user_id = (select auth.uid())
      )
    )
  );

create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Logged-out visitors (anon) get no access to these tables at all.
-- ---------------------------------------------------------------
revoke all on public.profiles from anon;
revoke all on public.folders from anon;
revoke all on public.documents from anon;

-- ---------------------------------------------------------------
-- Private storage bucket for uploaded files (max 20 MB per file).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do nothing;

-- Files must be stored under "<user_id>/..." and only the owner can use them.
create policy "storage_documents_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage_documents_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

create policy "storage_documents_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
