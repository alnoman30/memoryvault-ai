# MemoryVault AI

A multi-user AI document management and personal knowledge platform.
Upload documents, organize them in folders, and ask questions in **Bangla or English**.
Answers include citations (document name and page).

## Tech stack
Next.js, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth, PostgreSQL, Storage, pgvector), Vercel.

## Run locally
```bash
npm install
cp .env.example .env.local   # then fill in your own values
npm run dev
```
Open http://localhost:3000

## Project documents
- [ARCHITECTURE.md](ARCHITECTURE.md) - how the system is designed
- [SECURITY.md](SECURITY.md) - security rules
- `.env.example` - list of required environment variables (no real secrets)

## Status
Early development: project scaffold created. Features are added phase by phase.
