# MemoryVault AI

A private, multi-user vault for your documents. Upload IDs, contracts and receipts,
organise them in folders, and (in the next phases) ask questions in **Bangla or English**
and get answers with the document and page they came from.

The app interface is in English. The chat assistant will understand and answer in both
Bangla and English.

## Status

| Area | State |
| --- | --- |
| Sign up, sign in, sign out (Supabase Auth) | Done |
| Private file storage + folders, upload, preview, download, rename, move, delete | Done |
| Row Level Security, tested against a real Postgres | Done |
| Reading document text with an AI provider (Gemini) | Next |
| Embeddings and search (pgvector) | Planned |
| Bilingual AI chat with citations and memory | Planned |

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Auth, PostgreSQL, Storage) · Vercel

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

Copy `.env.example` to `.env.local` and fill in your own Supabase values.
Only the **publishable** key belongs in the browser. Never put a secret key in
a `NEXT_PUBLIC_` variable.

## Set up the database
1. Open your Supabase project, then **SQL Editor** and **New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and press **Run**.

The migration is safe to run more than once.

## Checks
```bash
npm run lint
npm test            # unit tests
npm run build
```

Database security test (starts a throw-away Postgres, proves users cannot touch each
other's data):
```bash
cd supabase/tests
npm install
npm test
```
On Linux, Postgres refuses to run as root, so run it as a normal user.

## Documents
- [ARCHITECTURE.md](ARCHITECTURE.md): how it is built
- [SECURITY.md](SECURITY.md): security rules and what is tested
- `.env.example`: required settings (no real secrets)
