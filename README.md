# MemoryVault AI

A private, multi-user vault for your documents. Upload any file, organise it in folders,
and ask questions in **Bangla or English**. The assistant answers with the document and
page each fact came from, and remembers the conversation.

## Features

| Area | State |
| --- | --- |
| Sign up, sign in, sign out (Supabase Auth) | Done |
| Private file storage, folders, upload, preview, download, rename, move, delete | Done |
| Any file type, no app-side size limit, resumable uploads for large files | Done |
| Reading documents: PDF text, DOCX, TXT/MD/CSV/JSON/HTML locally; scans and photos with Gemini | Done |
| AI summary for every document | Done |
| Hybrid search: meaning (pgvector embeddings) + keywords (full text) | Done |
| Bilingual AI chat with clickable citations and chat history | Done |
| Settings: profile, AI status, re-read failed documents, delete chats | Done |
| Row Level Security on every table, tested against a real Postgres | Done |

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS · Supabase (Auth, PostgreSQL + pgvector,
Storage) · Google Gemini (free tier) · Vercel

## Keys you need

| Name | Where to get it | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API Keys / Data API | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (publishable key) | No |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (free) | **Yes**, server only |

No Supabase secret / service-role key is needed: every server request runs as the signed-in
user, so Row Level Security protects everything.

Optional: `GEMINI_CHAT_MODEL`, `GEMINI_READER_MODEL`, `GEMINI_EMBEDDING_MODEL`,
`AI_MAX_READ_MB` (see `.env.example`).

## Run locally
```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```
Open http://localhost:3000

## Set up the database (once)
Supabase > **SQL Editor** > **New query**, then paste and **Run**, in this order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_ai.sql`

Both are safe to run more than once.

## File size
The app has no size limit. Supabase has one global limit per file:
**Free plan: 50 MB**, Pro plan: up to 500 GB (Storage > Settings > Global file size limit).
Total storage on the Free plan is 1 GB. Files bigger than `AI_MAX_READ_MB` (default 50) are
stored but not read by the AI.

## How reading works
1. The browser uploads straight to private storage (files over 6 MB use resumable uploads).
2. The browser then calls `/api/documents/<id>/process` step by step until the document is
   ready. Each step stays far below Vercel's 300-second limit. If the tab is closed, reading
   continues the next time the vault is opened.
3. Text PDFs, DOCX and text files are read locally for free. Only pages without a text layer
   (scans, photos) are sent to Gemini.
4. Every piece of text gets an embedding (`gemini-embedding-001`, 768 dimensions).
5. When the free Gemini limit is reached, reading pauses and continues automatically.

## Checks
```bash
npm run lint
npm test            # unit tests (chunking, chat helpers, document processor)
npm run build
```

Database security test (needs a Postgres with the pgvector extension):
```bash
cd supabase/tests
npm install
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

## Documents
- [ARCHITECTURE.md](ARCHITECTURE.md): how it is built
- [SECURITY.md](SECURITY.md): security rules and what is tested
- `.env.example`: settings (no real secrets)
