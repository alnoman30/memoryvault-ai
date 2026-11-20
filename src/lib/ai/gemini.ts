import "server-only";
import { GoogleGenAI, createPartFromUri, type Content, type Part } from "@google/genai";
import { EMBEDDING_DIMENSIONS, getAiConfig } from "./config";
import {
  AiNotConfiguredError,
  AiRateLimitError,
  isModelUnavailable,
  isRateLimit,
  retryDelayMs,
} from "./errors";

// Gemini implementation of the AI provider. Everything that talks to an AI
// service lives in src/lib/ai, so another provider can be added later.

let cached: { key: string; client: GoogleGenAI } | null = null;

function getClient(): GoogleGenAI {
  const { apiKey } = getAiConfig();
  if (!apiKey) throw new AiNotConfiguredError();
  if (!cached || cached.key !== apiKey) {
    cached = { key: apiKey, client: new GoogleGenAI({ apiKey }) };
  }
  return cached.client;
}

// Runs `fn` with the first model that works. A busy or missing model moves on
// to the next one; any other error stops immediately.
async function withModels<T>(models: string[], fn: (model: string) => Promise<T>): Promise<T> {
  let lastRateLimit: unknown = null;
  let lastError: unknown = null;
  for (const model of models) {
    try {
      return await fn(model);
    } catch (error) {
      if (isRateLimit(error)) {
        lastRateLimit = error;
        continue;
      }
      if (isModelUnavailable(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastRateLimit) throw new AiRateLimitError(retryDelayMs(lastRateLimit));
  throw lastError ?? new Error("No AI model is available.");
}

/* ------------------------------------------------------------------ */
/* Embeddings                                                          */
/* ------------------------------------------------------------------ */

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(texts: string[], task: EmbedTask): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getClient();
  const { embeddingModel } = getAiConfig();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    try {
      const result = await ai.models.embedContent({
        model: embeddingModel,
        contents: batch,
        config: { taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const vectors = (result.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
        throw new Error("The embedding service returned an unexpected result.");
      }
      out.push(...vectors);
    } catch (error) {
      if (isRateLimit(error)) throw new AiRateLimitError(retryDelayMs(error));
      throw error;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Text generation                                                     */
/* ------------------------------------------------------------------ */

type GenerateOptions = {
  system?: string;
  contents: Content[] | string;
  models?: string[];
  jsonSchema?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
};

export async function generateText(options: GenerateOptions): Promise<string> {
  const ai = getClient();
  const models = options.models ?? getAiConfig().chatModels;
  return withModels(models, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: options.contents,
      config: {
        systemInstruction: options.system,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        ...(options.jsonSchema
          ? { responseMimeType: "application/json", responseJsonSchema: options.jsonSchema }
          : {}),
      },
    });
    return response.text ?? "";
  });
}

// Streams the answer piece by piece. Falling back to another model is only
// possible before the first piece has been sent.
export async function* streamText(options: GenerateOptions): AsyncGenerator<string> {
  const ai = getClient();
  const models = options.models ?? getAiConfig().chatModels;
  const stream = await withModels(models, (model) =>
    ai.models.generateContentStream({
      model,
      contents: options.contents,
      config: {
        systemInstruction: options.system,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      },
    }),
  );
  try {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  } catch (error) {
    if (isRateLimit(error)) throw new AiRateLimitError(retryDelayMs(error));
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Reading files (OCR / transcription)                                 */
/* ------------------------------------------------------------------ */

export type FileInput = { bytes: Uint8Array; mimeType: string; name: string };

// Small files are sent inline. Larger ones go through the Gemini Files API
// (kept for a short time by Google, deleted again by us when done).
const INLINE_LIMIT = 14 * 1024 * 1024;

export async function withFilePart<T>(file: FileInput, fn: (part: Part) => Promise<T>): Promise<T> {
  if (file.bytes.byteLength <= INLINE_LIMIT) {
    const data = Buffer.from(file.bytes).toString("base64");
    return fn({ inlineData: { mimeType: file.mimeType, data } });
  }

  const ai = getClient();
  const blob = new Blob([new Uint8Array(file.bytes)], { type: file.mimeType });
  let uploaded = await ai.files.upload({
    file: blob,
    config: { mimeType: file.mimeType, displayName: file.name.slice(0, 100) },
  });
  try {
    const started = Date.now();
    while (uploaded.state === "PROCESSING" && Date.now() - started < 90_000) {
      await new Promise((r) => setTimeout(r, 2000));
      uploaded = await ai.files.get({ name: uploaded.name! });
    }
    if (uploaded.state === "FAILED" || !uploaded.uri) {
      throw new Error("The AI service could not open this file.");
    }
    return await fn(createPartFromUri(uploaded.uri, uploaded.mimeType ?? file.mimeType));
  } finally {
    if (uploaded.name) {
      await ai.files.delete({ name: uploaded.name }).catch(() => undefined);
    }
  }
}

const PAGES_SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: { type: "integer" },
          text: { type: "string" },
        },
        required: ["page", "text"],
      },
    },
  },
  required: ["pages"],
};

const OCR_RULES = `Transcribe every readable word exactly as written.
Keep the original language and script: Bangla stays Bangla, English stays English. Never translate.
Keep line breaks and table rows on their own lines. Do not summarise or add comments.
If a page has almost no text (for example a photo), write one short sentence that describes what it shows, starting with "[Image]".`;

export type PageText = { page: number; text: string };

// `pages` are 1-based page numbers of a PDF; null means "the whole file"
// (an image, or a PDF whose pages could not be counted).
export async function transcribe(part: Part, pages: number[] | null): Promise<PageText[]> {
  const { readerModels } = getAiConfig();
  const which = pages
    ? `Transcribe only these pages of the attached document: ${pages.join(", ")}. Use the real page numbers.`
    : "Transcribe the attached file. Number its pages from 1 (an image is page 1).";

  const raw = await generateText({
    models: readerModels,
    temperature: 0,
    jsonSchema: PAGES_SCHEMA,
    contents: [{ role: "user", parts: [part, { text: `${which}\n\n${OCR_RULES}` }] }],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models wrap JSON in a code fence.
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  }
  const list = (parsed as { pages?: unknown }).pages;
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({
      page: Number((p as PageText).page),
      text: String((p as PageText).text ?? ""),
    }))
    .filter((p) => Number.isInteger(p.page) && p.page > 0);
}

export async function summarize(name: string, text: string): Promise<string> {
  const { readerModels } = getAiConfig();
  const summary = await generateText({
    models: readerModels,
    temperature: 0.2,
    maxOutputTokens: 300,
    contents: `File name: ${name}

Write a summary of this document in one or two sentences, in the same language as the document.
Say what kind of document it is and the key facts (names, dates, amounts, ID numbers are fine).
Plain text only.

Document text:
${text}`,
  });
  return summary.trim().slice(0, 600);
}
