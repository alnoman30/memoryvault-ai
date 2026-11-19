# MemoryVault AI - Architecture

## Stack
- **Next.js (App Router) + TypeScript** - web app and server routes
- **Tailwind CSS + shadcn/ui** - responsive UI
- **Supabase Auth** - user registration and login
- **PostgreSQL + pgvector** - data and semantic search
- **Supabase Storage (private bucket)** - uploaded files
- **Vercel** - hosting

## Data flow (planned)
1. User uploads a file -> stored in a private bucket under `<user_id>/...`
2. Server extracts text (PDF/DOCX/TXT directly, images via OCR)
3. Text is split into chunks, each chunk gets an embedding vector
4. Chunks + page numbers + embeddings are saved in PostgreSQL
5. In chat, the question is embedded, similar chunks are retrieved,
   and the AI answers with citations (file name + page)

## AI provider abstraction
All AI calls go through one interface in `src/lib/ai/` so providers
(Gemini, local models, others) can be swapped without touching the rest
of the app.

## Isolation
Every table has a `user_id` column and Row Level Security (RLS) policies
so a user can only ever read or write their own rows and files.

## Status
- Done: project scaffold, Supabase auth (sign up / log in / log out), database
  schema with Row Level Security, private storage bucket, file manager
  (folders, upload, rename, move, preview, download, delete).
- Next: text extraction and OCR, embeddings and vector search, AI chat.

## File manager notes
- Files are uploaded from the browser straight to the private `documents`
  bucket under `<user_id>/<random id>.<ext>`; the original name is kept only
  in the `documents` table.
- Preview and download use signed links that expire after 60 seconds.
- A folder can only be deleted when it is empty.
