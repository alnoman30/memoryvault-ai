# MemoryVault AI - Security Rules

1. **No secrets in Git.** `.env*` files are ignored; only `.env.example` is committed.
2. **Service-role key is server-only.** It must never use the `NEXT_PUBLIC_` prefix
   and never be imported in client components.
3. **Row Level Security on every table.** Users only access rows where
   `user_id = auth.uid()`.
4. **Private storage.** Files live in a private bucket; access is via short-lived
   signed URLs, with policies restricted to the owner's folder.
5. **Sensitive documents (NID, passport, etc.)** are never sent to an external AI
   provider without explicit, informed user consent. Local/browser OCR is preferred.
6. **Security tests** will prove that user A cannot read user B's documents,
   chunks, conversations or files.

## Reporting
This is a personal project in development. Report issues to the project owner.
