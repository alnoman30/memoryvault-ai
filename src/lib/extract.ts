import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { getExtension } from "./documents";
import { meaningfulLength } from "./text/chunk";

// Reads text out of files locally (free, no AI needed). Only pages that have
// no real text layer (scans, photos) are sent to the AI for reading.

// A page with fewer letters than this is treated as a scan.
export const MIN_PAGE_LETTERS = 25;

export type PdfText = { pageCount: number; pages: string[] };

export async function readPdf(bytes: Uint8Array): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { pageCount: totalPages, pages: text };
}

export function pagesNeedingOcr(pages: string[]): number[] {
  const out: number[] = [];
  pages.forEach((text, i) => {
    if (meaningfulLength(text) < MIN_PAGE_LETTERS) out.push(i + 1);
  });
  return out;
}

export async function readDocx(bytes: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export function readPlainText(bytes: Uint8Array, fileName: string): string {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const ext = getExtension(fileName);
  if (ext === "html" || ext === "htm" || ext === "xml") {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  if (ext === "rtf") {
    text = text.replace(/\\[a-z]+-?\d* ?|[{}]/gi, " ");
  }
  return text;
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export function mimeForAi(fileName: string): string {
  const ext = getExtension(fileName);
  if (ext === "pdf") return "application/pdf";
  return IMAGE_MIME[ext] ?? "application/octet-stream";
}
