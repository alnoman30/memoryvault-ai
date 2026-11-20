// AI settings, read on the server only. Nothing here may use NEXT_PUBLIC_.
//
// Model names change over time. Defaults are free-tier Gemini models; set the
// GEMINI_*_MODEL variables to switch without touching code.

export const EMBEDDING_DIMENSIONS = 768; // must match vector(768) in 0002_ai.sql

export type AiConfig = {
  apiKey: string | null;
  chatModels: string[];
  readerModels: string[];
  embeddingModel: string;
  maxReadBytes: number;
};

function list(...values: (string | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

export function getAiConfig(): AiConfig {
  const maxReadMb = Number(process.env.AI_MAX_READ_MB ?? "50");
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || null,
    // Tried in order: if one is busy or unavailable, the next one is used.
    chatModels: list(
      process.env.GEMINI_CHAT_MODEL,
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
    ),
    readerModels: list(
      process.env.GEMINI_READER_MODEL,
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-flash-latest",
    ),
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
    maxReadBytes: (Number.isFinite(maxReadMb) && maxReadMb > 0 ? maxReadMb : 50) * 1024 * 1024,
  };
}

export function isAiConfigured(): boolean {
  return getAiConfig().apiKey !== null;
}
