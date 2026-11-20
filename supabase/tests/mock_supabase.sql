-- Minimal stand-in for the parts of Supabase that our migration depends on
-- (roles, auth.users, auth.uid(), storage.buckets, storage.objects).
-- Used ONLY by the local security test. Never run this on a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Supabase reads the logged-in user id from the request's JWT claims.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
