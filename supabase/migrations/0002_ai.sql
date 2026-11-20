-- =====================================================================
-- MemoryVault AI - migration 0002: AI reading, search and chat
--
-- Adds:
--   * no upload size limit on the "documents" bucket
--     (your Supabase plan's global limit still applies: 50 MB on Free)
--   * processing columns on documents (stage, page count, error, summary)
--   * document_chunks: the text of every document, split into pieces,
--     with an AI embedding (pgvector) and a full-text index
--   * conversations + messages: chat history ("memory")
--   * match_chunks(): hybrid search (meaning + keywords) used by the chat
--   * removes the old "sensitive document" columns (no longer used)
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Run 0001_init.sql first. Safe to run more than once.
-- =====================================================================

-- pgvector lives in the "extensions" schema on Supabase.
-- If it was switched on earlier in another schema (e.g. "public"), move it.
create schema if not exists extensions;
do $$
declare
  current_schema_name text;
begin
  select n.nspname into current_schema_name
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  if current_schema_name is null then
    create extension vector with schema extensions;
  elsif current_schema_name <> 'extensions' then
    alter extension vector set schema extensions;
  end if;
end
$$;

-- ---------------------------------------------------------------
-- Start from a known state.
-- A project may already contain older, hand-made versions of the tables
-- below (with other columns), extra policies, or other match_chunks
-- functions. This block cleans that up. Only the chunk table can be
-- rebuilt, because its content is re-created by reading the documents
-- again; conversations and messages keep their rows.
-- ---------------------------------------------------------------
do $$
declare
  p record;
  needs_rebuild boolean := false;
begin
  if to_regclass('public.document_chunks') is not null then
    select
      count(*) filter (where column_name in
        ('id', 'user_id', 'document_id', 'page', 'chunk_index', 'content', 'embedding', 'fts', 'created_at')) < 9
      or bool_or(column_name = 'embedding' and format_type(a.atttypid, a.atttypmod) not like '%vector(768)')
      or bool_or(column_name = 'id' and data_type <> 'uuid')
    into needs_rebuild
    from information_schema.columns c
    join pg_attribute a
      on a.attrelid = 'public.document_chunks'::regclass and a.attname = c.column_name
    where c.table_schema = 'public' and c.table_name = 'document_chunks';

    if needs_rebuild then
      drop table public.document_chunks cascade;
      -- Their text is gone, so every document is read again by the app.
      update public.documents set status = 'uploaded'
      where status in ('processing', 'ready', 'failed');
    end if;
  end if;

  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('document_chunks', 'conversations', 'messages')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;

  for p in
    select oid::regprocedure as signature
    from pg_proc
    where proname = 'match_chunks' and pronamespace = 'public'::regnamespace
  loop
    execute format('drop function %s', p.signature);
  end loop;
end
$$;

-- ---------------------------------------------------------------
-- Uploads: no size limit at bucket level, any file type.
-- ---------------------------------------------------------------
update storage.buckets
set file_size_limit = null
where id = 'documents';

-- ---------------------------------------------------------------
-- Sensitive-document handling is removed.
-- ---------------------------------------------------------------
alter table public.documents drop column if exists is_sensitive;
alter table public.profiles drop column if exists allow_external_ai;

-- ---------------------------------------------------------------
-- documents: processing state
--   status: uploaded -> processing -> ready | failed | skipped
--   stage (while processing): extract -> ocr -> embed -> summary
-- ---------------------------------------------------------------
alter table public.documents add column if not exists stage text;
alter table public.documents add column if not exists page_count integer;
alter table public.documents add column if not exists ocr_pages integer[];
alter table public.documents add column if not exists error text;
alter table public.documents add column if not exists summary text;
alter table public.documents add column if not exists processed_at timestamptz;

alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('uploaded', 'processing', 'ready', 'failed', 'skipped'));

alter table public.documents drop constraint if exists documents_stage_check;
alter table public.documents add constraint documents_stage_check
  check (stage is null or stage in ('extract', 'ocr', 'embed', 'summary'));

-- ---------------------------------------------------------------
-- Ownership helpers (same idea as owns_folder in 0001).
-- ---------------------------------------------------------------
create or replace function public.owns_document(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents
    where id = target and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_document(uuid) from public, anon;
grant execute on function public.owns_document(uuid) to authenticated;

-- ---------------------------------------------------------------
-- document_chunks
-- ---------------------------------------------------------------
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  page integer,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(768),
  fts tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now()
);

-- (only reached for a missing table, or one that already had every column)

create index if not exists document_chunks_user_id_idx on public.document_chunks (user_id);
create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_fts_idx on public.document_chunks using gin (fts);
create index if not exists document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.document_chunks enable row level security;

drop policy if exists "chunks_select_own" on public.document_chunks;
create policy "chunks_select_own" on public.document_chunks
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "chunks_insert_own" on public.document_chunks;
create policy "chunks_insert_own" on public.document_chunks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_document(document_id)
  );

drop policy if exists "chunks_update_own" on public.document_chunks;
create policy "chunks_update_own" on public.document_chunks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.owns_document(document_id)
  );

drop policy if exists "chunks_delete_own" on public.document_chunks;
create policy "chunks_delete_own" on public.document_chunks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- conversations + messages (chat history)
-- ---------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older hand-made versions may miss some columns.
alter table public.conversations add column if not exists user_id uuid default auth.uid()
  references auth.users (id) on delete cascade;
alter table public.conversations add column if not exists title text not null default 'New chat';
alter table public.conversations add column if not exists created_at timestamptz not null default now();
alter table public.conversations add column if not exists updated_at timestamptz not null default now();

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own" on public.conversations
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create or replace function public.owns_conversation(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations
    where id = target and user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_conversation(uuid) from public, anon;
grant execute on function public.owns_conversation(uuid) to authenticated;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- [{ "n": 1, "document_id": "...", "name": "...", "page": 4 }]
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists user_id uuid default auth.uid()
  references auth.users (id) on delete cascade;
alter table public.messages add column if not exists conversation_id uuid
  references public.conversations (id) on delete cascade;
alter table public.messages add column if not exists role text not null default 'user';
alter table public.messages add column if not exists content text not null default '';
alter table public.messages add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.messages add column if not exists created_at timestamptz not null default now();

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_conversation(conversation_id)
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Hybrid search. SECURITY INVOKER: it runs as the caller, so Row Level
-- Security limits it to the caller's own chunks and documents.
-- Results from meaning (vector) and keywords (full text) are merged with
-- reciprocal rank fusion. With no embedding, keyword search alone is used.
-- ---------------------------------------------------------------
create function public.match_chunks(
  query_embedding extensions.vector(768),
  query_text text,
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  page integer,
  content text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with semantic as (
    select c.id,
           row_number() over (
             order by c.embedding operator(extensions.<=>) query_embedding
           ) as rank
    from public.document_chunks c
    where query_embedding is not null
      and c.embedding is not null
    order by c.embedding operator(extensions.<=>) query_embedding
    limit greatest(match_count, 1) * 4
  ),
  keyword as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, websearch_to_tsquery('simple'::regconfig, query_text)) desc
           ) as rank
    from public.document_chunks c
    where coalesce(query_text, '') <> ''
      and c.fts @@ websearch_to_tsquery('simple'::regconfig, query_text)
    order by ts_rank_cd(c.fts, websearch_to_tsquery('simple'::regconfig, query_text)) desc
    limit greatest(match_count, 1) * 4
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.rank), 0.0) + coalesce(1.0 / (60 + k.rank), 0.0) as score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select c.id, c.document_id, d.name, c.page, c.content, f.score::double precision
  from fused f
  join public.document_chunks c on c.id = f.id
  join public.documents d on d.id = c.document_id
  order by f.score desc
  limit greatest(match_count, 1);
$$;

revoke execute on function public.match_chunks(extensions.vector, text, integer) from public, anon;
grant execute on function public.match_chunks(extensions.vector, text, integer) to authenticated;

-- ---------------------------------------------------------------
-- TABLE PERMISSIONS
-- ---------------------------------------------------------------
grant usage on schema extensions to authenticated;
grant select, insert, update, delete on public.document_chunks to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;

revoke all on public.document_chunks from anon;
revoke all on public.conversations from anon;
revoke all on public.messages from anon;
