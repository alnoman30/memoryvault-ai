-- MemoryVault AI - migration 0002: explicit table permissions.
--
-- Row Level Security (RLS) decides WHICH rows a user may touch, but the
-- database role also needs permission to use the table at all. Newer
-- Supabase projects do not hand this out automatically, so we grant it
-- explicitly and only to logged-in users ("authenticated").
-- Logged-out visitors ("anon") get nothing.
--
-- Safe to run more than once.

grant usage on schema public to authenticated;

-- profiles are created by a database trigger; users may only read/update their own.
grant select, update on public.profiles to authenticated;

grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.documents to authenticated;

revoke all on public.profiles from anon;
revoke all on public.folders from anon;
revoke all on public.documents from anon;
