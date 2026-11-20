# MemoryVault AI - Architecture

## Stack
- **Next.js (App Router) + TypeScript**: web app and server actions
- **Tailwind CSS**: styling, with design tokens in `src/app/globals.css`
- **Supabase Auth**: registration and login
- **PostgreSQL**: data, with Row Level Security (RLS) on every table
- **Supabase Storage**: one private bucket, `documents`
- **Vercel**: hosting

## Interface language
The interface is English only. Only the AI chat assistant speaks Bangla and English.

## Data model (`supabase/migrations/0001_init.sql`)
- `profiles`: one row per user, created by a database trigger at sign up.
  `allow_external_ai` is `false` by default.
- `folders`: nested folders (`parent_id`).
- `documents`: file metadata. The file itself lives in Storage at
  `<user_id>/<random id>.<ext>`.
  `is_sensitive` marks identity documents.
- Helper `owns_folder(uuid)`: a SECURITY DEFINER check used by policies. A policy on
  `folders` cannot query `folders` directly (Postgres reports "infinite recursion
  detected in policy"), so the lookup goes through this function.

## Request flow
- The browser uploads a file straight to the private bucket. Storage policies only
  allow writing inside the signed-in user's own folder, then a `documents` row is added.
- Folder and file operations are server actions that run as the signed-in user, so RLS
  applies to everything they do.
- Preview and download use signed links that expire after 60 seconds.
- A folder can only be deleted when it is empty.

## UI building blocks (`src/components/ui`)
`Modal` (native `<dialog>`; becomes a bottom sheet on phones), `Toast`, `Menu`,
button and input class helpers. File manager screens are in `src/components/explorer`.

## Planned: reading documents with an AI provider
There is no in-browser OCR. Text extraction will go through an **AI provider
abstraction** (`src/lib/ai/`), starting with Gemini, so the provider can be swapped.

1. After upload, the server sends the file to the provider to extract text with page numbers.
2. The text is split into chunks, embedded, and stored with `pgvector`.
3. In chat, the question is embedded, similar chunks are retrieved, and the assistant
   answers with citations (file name and page).

Rule: a document marked `is_sensitive` is **never** sent to an external provider unless
the user has explicitly allowed it (`profiles.allow_external_ai`) after being told what
that means.
