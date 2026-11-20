# MemoryVault AI - Security Rules

1. **No secrets in Git.** `.env*` files are ignored; only `.env.example` is committed.
2. **Secret keys are server-only.** `GEMINI_API_KEY` never uses the `NEXT_PUBLIC_` prefix and
   is only read in `src/lib/ai` (marked `server-only`, so it cannot end up in browser code).
   No Supabase secret / service-role key is used anywhere.
3. **Row Level Security on every table.** Users only reach rows where
   `user_id = auth.uid()`. Logged-out visitors (`anon`) have no table access at all. The
   search function runs as the caller (SECURITY INVOKER), so RLS applies to it too.
4. **Private storage.** Files live in a private bucket under `<user_id>/`. Access is through
   links that expire after 60 seconds.
5. **AI provider.** Text PDFs, DOCX and text files are read on our own server. Scans, photos,
   search queries and chat messages are sent to Google Gemini. On the free Gemini tier Google
   may use this data to improve its products; a paid Gemini plan does not. Choose accordingly
   before storing identity documents.
6. **Answers are formatted safely.** Assistant text is rendered without HTML injection.
7. **Honest limits.** Supabase Free: 50 MB per file, 1 GB in total. Gemini free tier has
   per-minute and per-day limits; reading pauses and resumes when they are reached.

## What is tested
`supabase/tests/rls.isolation.mjs` applies both migrations (twice) to a throw-away database
and checks, with two different users:

- a signed-in user can create folders, sub-folders, documents and storage objects
- user B cannot read, rename, move or delete user A's folders, documents, profile or files
- user B cannot create anything inside A's folders or A's storage folder
- user B cannot create a record owned by A
- search only ever returns the caller's own chunks (meaning and keyword search, Bangla too)
- user B cannot read, add or delete A's chunks, conversations or messages
- deleting a document deletes its chunks
- logged-out visitors cannot read or write anything
- profiles can only be created by the sign-up trigger

Run it with `cd supabase/tests && npm install && TEST_DATABASE_URL=... npm test`
(the database needs the pgvector extension).

## Reporting
This is a personal project. Report issues to the project owner.
