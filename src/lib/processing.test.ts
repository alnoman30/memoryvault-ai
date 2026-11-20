import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase } from "@/test/fake-supabase";
import { AiRateLimitError } from "./ai/errors";

const ai = vi.hoisted(() => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => Array(768).fill(0.1))),
  transcribe: vi.fn(async (_part: unknown, pages: number[] | null) =>
    (pages ?? [1]).map((page) => ({ page, text: `Scanned page ${page}: স্বাক্ষর ও সিলমোহর দেওয়া আছে।` })),
  ),
  withFilePart: vi.fn(async (_file: unknown, fn: (p: unknown) => Promise<unknown>) => fn({ inlineData: {} })),
  summarize: vi.fn(async () => "A rental agreement that ends on 31 March 2028."),
}));
vi.mock("./ai/gemini", () => ai);

import { runProcessingStep } from "./processing";

const fixture = (name: string) =>
  new Uint8Array(fs.readFileSync(path.join(__dirname, "__fixtures__", name)));

const USER = "user-1";

function setup(name: string, storagePath: string, bytes: Uint8Array) {
  const db = fakeSupabase({ [storagePath]: bytes });
  db.tables.documents.push({
    id: "doc-1",
    user_id: USER,
    name,
    storage_path: storagePath,
    size_bytes: bytes.byteLength,
    status: "uploaded",
    stage: null,
    ocr_pages: null,
    page_count: null,
  });
  return { db, supabase: db.client as unknown as SupabaseClient };
}

describe("runProcessingStep", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("reads a PDF: text pages locally, scanned pages with AI, then embeds and summarises", async () => {
    const { db, supabase } = setup("lease.pdf", `${USER}/a.pdf`, fixture("two-pages.pdf"));
    const result = await runProcessingStep(supabase, USER, "doc-1");

    expect(result.status).toBe("ready");
    const doc = db.tables.documents[0];
    expect(doc.page_count).toBe(2);
    expect(doc.summary).toContain("2028");

    const chunks = db.tables.document_chunks;
    expect(chunks.find((c) => c.page === 1)?.content).toContain("31 March 2028");
    expect(chunks.find((c) => c.page === 2)?.content).toContain("Scanned page 2");
    expect(chunks.every((c) => typeof c.embedding === "string")).toBe(true);
    expect(ai.transcribe).toHaveBeenCalledWith(expect.anything(), [2]);
  });

  it("works without an AI key: text pages are stored, scans are skipped", async () => {
    delete process.env.GEMINI_API_KEY;
    const { db, supabase } = setup("lease.pdf", `${USER}/a.pdf`, fixture("two-pages.pdf"));
    const result = await runProcessingStep(supabase, USER, "doc-1");

    expect(result.status).toBe("ready");
    expect(db.tables.document_chunks).toHaveLength(1);
    expect(db.tables.document_chunks[0].embedding).toBeNull();
    expect(ai.transcribe).not.toHaveBeenCalled();
  });

  it("reads DOCX files", async () => {
    const { db, supabase } = setup("contract.docx", `${USER}/c.docx`, fixture("contract.docx"));
    expect((await runProcessingStep(supabase, USER, "doc-1")).status).toBe("ready");
    expect(db.tables.document_chunks[0].content).toContain("first working day");
    expect(db.tables.document_chunks[0].page).toBeNull();
  });

  it("reads photos with the AI", async () => {
    const { db, supabase } = setup("nid.jpg", `${USER}/n.jpg`, new Uint8Array([1, 2, 3]));
    expect((await runProcessingStep(supabase, USER, "doc-1")).status).toBe("ready");
    expect(ai.transcribe).toHaveBeenCalledWith(expect.anything(), null);
    expect(db.tables.document_chunks[0].page).toBe(1);
  });

  it("uses the stored extension even after the file was renamed", async () => {
    const { supabase } = setup("renamed without extension", `${USER}/c.docx`, fixture("contract.docx"));
    expect((await runProcessingStep(supabase, USER, "doc-1")).status).toBe("ready");
  });

  it("stores other file types without reading them", async () => {
    const { db, supabase } = setup("backup.zip", `${USER}/b.zip`, new Uint8Array([1]));
    expect((await runProcessingStep(supabase, USER, "doc-1")).status).toBe("skipped");
    expect(db.tables.documents[0].error).toMatch(/does not read/);
  });

  it("pauses on a free-tier limit and continues on the next call", async () => {
    ai.embedTexts.mockRejectedValueOnce(new AiRateLimitError(15_000));
    const { db, supabase } = setup("lease.pdf", `${USER}/a.pdf`, fixture("two-pages.pdf"));

    const first = await runProcessingStep(supabase, USER, "doc-1");
    expect(first.status).toBe("processing");
    expect(first.retryAfterMs).toBe(15_000);
    expect(db.tables.documents[0].stage).toBe("embed");

    const second = await runProcessingStep(supabase, USER, "doc-1");
    expect(second.status).toBe("ready");
    // The text was not read twice.
    expect(db.tables.document_chunks).toHaveLength(2);
  });

  it("marks broken files as failed with a friendly message", async () => {
    const { db, supabase } = setup("x.docx", `${USER}/x.docx`, new Uint8Array([1, 2, 3]));
    const result = await runProcessingStep(supabase, USER, "doc-1");
    expect(result.status).toBe("failed");
    expect(db.tables.documents[0].error).toMatch(/could not be read/);
  });

  it("can read a finished document again from scratch", async () => {
    const { db, supabase } = setup("contract.docx", `${USER}/c.docx`, fixture("contract.docx"));
    await runProcessingStep(supabase, USER, "doc-1");
    await runProcessingStep(supabase, USER, "doc-1", { restart: true });
    expect(db.tables.document_chunks).toHaveLength(1);
  });
});
