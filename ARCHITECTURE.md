# MemoryVault AI - Architecture

## Stack
- **Next.js (App Router) + TypeScript**: web app, server actions, route handlers
- **Tailwind CSS**: styling, with design tokens in `src/app/globals.css`
- **Supabase Auth**: registration and login
- **PostgreSQL + pgvector**: data and embeddings, Row Level Security (RLS) on every table
- **Supabase Storage**: one private bucket, `documents`
- **Google Gemini** (free tier): reading scans and photos, embeddings, summaries, chat
- **Vercel**: hosting

## Interface language
The interface is English. The chat assistant answers in the language of the question
(Bangla or English).

## Data model
`supabase/migrations/0001_init.sql`
- `profiles`: one row per user, created by a trigger at sign up.
- `folders`: nested folders (`parent_id`).
- `documents`: file metadata. The file lives in Storage at `<user_id>/<random id>.<ext>`.
- `owns_folder(uuid)`: SECURITY DEFINER helper used by policies (avoids policy recursion).

`supabase/migrations/0002_ai.sql`
- `documents` gains `status` (`uploaded | processing | ready | failed | skipped`), `stage`
  (`extract | ocr | embed | summary`), `page_count`, `ocr_pages`, `error`, `summary`.
- `document_chunks`: pieces of text with `page`, an `embedding vector(768)` (HNSW index) and a
  generated `fts tsvector` ('simple' config, works for Bangla and English).
- `conversations` and `messages` (with the cited `sources` as JSON): chat history.
- `match_chunks(embedding, text, count)`: hybrid search, SECURITY INVOKER so RLS applies,
  vector and keyword results merged with reciprocal rank fusion.
- The bucket has no size limit of its own; the project's global limit applies.

## Code map
| Path | What it does |
| --- | --- |
| `src/lib/ai/config.ts` | model names (env overridable, with fallbacks), limits |
| `src/lib/ai/gemini.ts` | the only file that talks to Gemini: embed, generate, stream, transcribe, summarise |
| `src/lib/ai/errors.ts` | rate-limit detection, retry delays, friendly messages |
| `src/lib/extract.ts` | local reading: PDF (unpdf), DOCX (mammoth), plain text |
| `src/lib/text/chunk.ts` | splitting text at paragraph / sentence (`. ! ? ।`) boundaries |
| `src/lib/processing.ts` | the step-by-step document reader |
| `src/lib/chat.ts` | prompt, sources, citations, search query helpers |
| `src/lib/upload.ts` | browser upload (single request or resumable TUS) |
| `src/app/api/documents/[id]/process` | one processing step |
| `src/app/api/chat` | streaming chat (NDJSON events) |
| `src/components/explorer` | file manager; `processing.ts` drives reading from the browser |
| `src/components/chat` | chat screen and the safe answer formatter |

## Request flow
**Upload.** The browser uploads directly to the private bucket (storage policies only allow
`<own user id>/...`), then inserts the `documents` row and starts processing.

**Processing.** Serverless functions have a time limit, so reading runs in steps. The browser
calls the step endpoint in a loop; each call works for at most ~4 minutes and saves progress
in the `documents` row. A free-tier limit returns `retryAfterMs` and the browser waits.

**Chat.** The question (plus the previous one for short follow-ups) is embedded and
`match_chunks` returns the best passages. Gemini gets the chat history, the document list with
summaries and the numbered passages, and must cite them as `[1]`. The answer is streamed, then
saved with the sources it cited. Citations open the file at the cited page.

## AI provider
All provider code is in `src/lib/ai`. To use another provider, replace `gemini.ts` with a module
that has the same functions (`embedTexts`, `generateText`, `streamText`, `withFilePart`,
`transcribe`, `summarize`). Embeddings must stay 768-dimensional or the migration must change.
