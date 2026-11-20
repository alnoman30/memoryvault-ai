import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiConfig } from "./ai/config";
import {
  AiNotConfiguredError,
  AiRateLimitError,
  friendlyAiError,
  messageOf,
  statusOf,
} from "./ai/errors";
import { embedTexts, summarize, transcribe, withFilePart } from "./ai/gemini";
import { fileKindOf, isReadable, type DocStatus } from "./documents";
import { mimeForAi, pagesNeedingOcr, readDocx, readPdf, readPlainText } from "./extract";
import { chunkText, meaningfulLength } from "./text/chunk";

// Reading a document happens in small steps so it fits inside the time a
// serverless function may run (Vercel Hobby: 300 s). The browser keeps
// calling the step endpoint until the document is "ready".
//
//   extract  read text locally (PDF text layer, DOCX, TXT ...)
//   ocr      pages without text (scans, photos) are read by the AI
//   embed    every chunk gets an embedding for search by meaning
//   summary  a one or two sentence summary for the file list and the chat
//
// Every query runs as the signed-in user, so Row Level Security applies.

export type StepResult = {
  status: DocStatus;
  stage: string | null;
  message?: string;
  retryAfterMs?: number;
};

type Doc = {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  status: DocStatus;
  stage: string | null;
  ocr_pages: number[] | null;
  page_count: number | null;
};

// 0 in ocr_pages means "read the whole file" (images, unreadable PDFs).
const WHOLE_FILE = 0;
const OCR_PAGES_PER_CALL = 5;
const EMBED_BATCH = 50;
const SUMMARY_INPUT_CHARS = 12_000;

type Supabase = SupabaseClient;

async function loadBytes(supabase: Supabase, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("documents").download(path);
  if (error || !data) throw new Error(`Could not open the stored file. ${error?.message ?? ""}`);
  return new Uint8Array(await data.arrayBuffer());
}

function chunkRows(userId: string, docId: string, page: number | null, text: string) {
  return chunkText(text).map((content, i) => ({
    user_id: userId,
    document_id: docId,
    page,
    chunk_index: (page ?? 0) * 1000 + i,
    content,
  }));
}

async function insertChunks(supabase: Supabase, rows: ReturnType<typeof chunkRows>) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`Could not save the document text. ${error.message}`);
  }
}

async function update(supabase: Supabase, id: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("documents").update(values).eq("id", id);
  if (error) throw new Error(`Could not update the document. ${error.message}`);
}

/** Puts a document back to the start, so it is read again from scratch. */
export async function resetDocument(supabase: Supabase, id: string) {
  const { error } = await supabase.from("document_chunks").delete().eq("document_id", id);
  if (error) throw new Error(error.message);
  await update(supabase, id, {
    status: "processing",
    stage: "extract",
    error: null,
    summary: null,
    ocr_pages: null,
    page_count: null,
    processed_at: null,
  });
}

export async function runProcessingStep(
  supabase: Supabase,
  userId: string,
  id: string,
  { budgetMs = 240_000, restart = false } = {},
): Promise<StepResult> {
  const deadline = Date.now() + budgetMs;
  const ai = getAiConfig();
  const aiReady = ai.apiKey !== null;

  const load = async (): Promise<Doc> => {
    const { data, error } = await supabase
      .from("documents")
      .select("id, name, storage_path, size_bytes, status, stage, ocr_pages, page_count")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Document not found.");
    return data as Doc;
  };

  let doc = await load();

  if (restart || doc.status === "uploaded" || doc.status === "failed" || !doc.stage) {
    if (!restart && (doc.status === "ready" || doc.status === "skipped")) {
      return { status: doc.status, stage: null };
    }
    await resetDocument(supabase, id);
    doc = await load();
  }

  let bytes: Uint8Array | null = null;
  const getBytes = async () => (bytes ??= await loadBytes(supabase, doc.storage_path));

  try {
    while (Date.now() < deadline) {
      /* ---------------- extract ---------------- */
      if (doc.stage === "extract") {
        // The storage path keeps the original extension even if the file is renamed.
        const kind = fileKindOf(doc.storage_path);
        if (!isReadable(kind)) {
          await update(supabase, id, {
            status: "skipped",
            stage: null,
            error: "Stored safely. The AI does not read this file type.",
            processed_at: new Date().toISOString(),
          });
          return { status: "skipped", stage: null };
        }
        if ((doc.size_bytes ?? 0) > ai.maxReadBytes) {
          await update(supabase, id, {
            status: "skipped",
            stage: null,
            error: `Stored safely. Files over ${Math.round(ai.maxReadBytes / 1048576)} MB are not read by the AI.`,
            processed_at: new Date().toISOString(),
          });
          return { status: "skipped", stage: null };
        }

        const data = await getBytes();
        let ocrPages: number[] = [];
        let pageCount: number | null = null;

        if (kind === "text" || kind === "word") {
          const text = kind === "word" ? await readDocx(data) : readPlainText(data, doc.name);
          await insertChunks(supabase, chunkRows(userId, id, null, text));
        } else if (kind === "image") {
          pageCount = 1;
          ocrPages = [WHOLE_FILE];
        } else {
          try {
            const pdf = await readPdf(data);
            pageCount = pdf.pageCount;
            const rows = pdf.pages.flatMap((text, i) =>
              meaningfulLength(text) >= 25 ? chunkRows(userId, id, i + 1, text) : [],
            );
            await insertChunks(supabase, rows);
            ocrPages = pagesNeedingOcr(pdf.pages);
          } catch {
            // Damaged or protected PDF: let the AI try the whole file.
            ocrPages = [WHOLE_FILE];
          }
        }

        const next = ocrPages.length > 0 ? "ocr" : "embed";
        await update(supabase, id, { stage: next, page_count: pageCount, ocr_pages: ocrPages });
        doc = { ...doc, stage: next, page_count: pageCount, ocr_pages: ocrPages };
        continue;
      }

      /* ---------------- ocr ---------------- */
      if (doc.stage === "ocr") {
        const remaining = doc.ocr_pages ?? [];
        if (remaining.length === 0 || !aiReady) {
          // Without an AI key, scans cannot be read; text pages still work.
          await update(supabase, id, { stage: "embed", ocr_pages: [] });
          doc = { ...doc, stage: "embed", ocr_pages: [] };
          continue;
        }

        const data = await getBytes();
        const file = { bytes: data, mimeType: mimeForAi(doc.storage_path), name: doc.name };
        let left = [...remaining];

        await withFilePart(file, async (part) => {
          while (left.length > 0 && Date.now() < deadline - 30_000) {
            const wholeFile = left[0] === WHOLE_FILE;
            const batch = wholeFile ? null : left.slice(0, OCR_PAGES_PER_CALL);
            const pages = await transcribe(part, batch);
            const rows = pages.flatMap((p) =>
              batch === null || batch.includes(p.page)
                ? chunkRows(userId, id, p.page, p.text)
                : [],
            );
            await insertChunks(supabase, rows);
            left = wholeFile ? [] : left.slice(batch!.length);
            const values: Record<string, unknown> = { ocr_pages: left };
            if (wholeFile && pages.length > 0 && !doc.page_count) {
              values.page_count = Math.max(...pages.map((p) => p.page));
            }
            await update(supabase, id, values);
          }
        });

        doc = { ...doc, ocr_pages: left };
        if (left.length > 0) return { status: "processing", stage: "ocr" };
        continue;
      }

      /* ---------------- embed ---------------- */
      if (doc.stage === "embed") {
        if (!aiReady) {
          await update(supabase, id, { stage: "summary" });
          doc = { ...doc, stage: "summary" };
          continue;
        }
        const { data: pending, error } = await supabase
          .from("document_chunks")
          .select("id, content")
          .eq("document_id", id)
          .is("embedding", null)
          .order("chunk_index")
          .limit(EMBED_BATCH);
        if (error) throw new Error(error.message);
        if (!pending || pending.length === 0) {
          await update(supabase, id, { stage: "summary" });
          doc = { ...doc, stage: "summary" };
          continue;
        }

        const vectors = await embedTexts(
          pending.map((c) => `${doc.name}\n${c.content}`),
          "RETRIEVAL_DOCUMENT",
        );
        for (let i = 0; i < pending.length; i += 10) {
          const slice = pending.slice(i, i + 10);
          const results = await Promise.all(
            slice.map((c, j) =>
              supabase
                .from("document_chunks")
                .update({ embedding: JSON.stringify(vectors[i + j]) })
                .eq("id", c.id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw new Error(failed.error.message);
        }
        continue;
      }

      /* ---------------- summary ---------------- */
      if (doc.stage === "summary") {
        let summary: string | null = null;
        const { data: chunks } = await supabase
          .from("document_chunks")
          .select("content")
          .eq("document_id", id)
          .order("chunk_index")
          .limit(40);
        const text = (chunks ?? []).map((c) => c.content).join("\n\n").slice(0, SUMMARY_INPUT_CHARS);

        if (aiReady && text) {
          try {
            summary = await summarize(doc.name, text);
          } catch (error) {
            // A missing summary is not a reason to fail the document,
            // but a busy AI is worth waiting for.
            if (error instanceof AiRateLimitError) throw error;
          }
        }

        const noText = !text;
        await update(supabase, id, {
          status: "ready",
          stage: null,
          summary,
          error: noText
            ? aiReady
              ? "No readable text was found in this file."
              : "No text layer found. Add GEMINI_API_KEY so scans and photos can be read."
            : null,
          processed_at: new Date().toISOString(),
        });
        return { status: "ready", stage: null };
      }

      throw new Error(`Unknown processing stage: ${doc.stage}`);
    }
    return { status: "processing", stage: doc.stage };
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      return {
        status: "processing",
        stage: doc.stage,
        retryAfterMs: Math.min(error.retryAfterMs, 120_000),
        message: friendlyAiError(error),
      };
    }
    console.error("Document processing failed", id, messageOf(error));
    const message =
      error instanceof AiNotConfiguredError || statusOf(error) !== null
        ? friendlyAiError(error)
        : "This file could not be read. Try again, or download it to check it opens.";
    await update(supabase, id, { status: "failed", stage: null, error: message }).catch(() => undefined);
    return { status: "failed", stage: null, message };
  }
}
