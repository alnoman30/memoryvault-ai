# MemoryVault AI - Security Rules

1. **No secrets in Git.** `.env*` files are ignored; only `.env.example` is committed.
   `.env.local` in a delivered copy contains only the public URL and publishable key.
2. **Service/secret keys are server-only.** They must never use the `NEXT_PUBLIC_`
   prefix and are never imported in client components.
3. **Row Level Security on every table.** Users only reach rows where
   `user_id = auth.uid()`. Logged-out visitors (`anon`) have no table access at all.
4. **Private storage.** Files live in a private bucket under `<user_id>/`. Access is
   through links that expire after 60 seconds.
5. **Sensitive documents (NID, passport, bank details)** are never sent to an external AI
   provider without explicit, informed consent from the user.
6. **Honest limits.** The free Supabase plan includes 1 GB of storage for the whole
   project. Free tiers of AI providers can have different data-use terms from paid
   tiers; this must be checked before any real identity document is sent to one.

## What is tested
`supabase/tests/rls.isolation.mjs` applies the real migration (twice) to a throw-away
Postgres and checks, with two different users:

- a signed-in user can create folders, sub-folders, documents and storage objects
- user B cannot read, rename, move or delete user A's folders, documents, profile or files
- user B cannot create anything inside A's folders or A's storage folder
- user B cannot create a record owned by A, or switch on external AI for A
- logged-out visitors cannot read or write anything
- profiles can only be created by the sign-up trigger

Run it with `cd supabase/tests && npm install && npm test`.

## Reporting
This is a personal project in development. Report issues to the project owner.
