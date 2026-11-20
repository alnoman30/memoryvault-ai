// There is no file size limit in the app. The only limit is the one set in
// Supabase (Storage > Settings > Global file size limit): 50 MB per file on
// the Free plan, up to 500 GB on paid plans.

// Supabase free plan: 1 GB of file storage for the whole project.
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

// File types the AI can read. Every other type is stored, but not read.
export const PDF_EXTENSIONS = ["pdf"] as const;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "heic", "heif"] as const;
export const WORD_EXTENSIONS = ["docx"] as const;
export const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "html",
  "htm",
  "log",
  "yaml",
  "yml",
  "rtf",
] as const;
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"] as const;
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac"] as const;

export type FileKind = "pdf" | "image" | "word" | "text" | "video" | "audio" | "other";

const has = (list: readonly string[], ext: string) => list.includes(ext);

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function fileKindOf(fileName: string): FileKind {
  const ext = getExtension(fileName);
  if (has(PDF_EXTENSIONS, ext)) return "pdf";
  if (has(IMAGE_EXTENSIONS, ext)) return "image";
  if (has(WORD_EXTENSIONS, ext)) return "word";
  if (has(TEXT_EXTENSIONS, ext)) return "text";
  if (has(VIDEO_EXTENSIONS, ext)) return "video";
  if (has(AUDIO_EXTENSIONS, ext)) return "audio";
  return "other";
}

// Can the AI read this kind of file?
export function isReadable(kind: FileKind): boolean {
  return kind === "pdf" || kind === "image" || kind === "word" || kind === "text";
}

// Returns a short error message, or null if the file is acceptable.
// Any type and any size is accepted; only empty files are refused.
export function validateUpload(file: { name: string; size: number }): string | null {
  if (!file.name.trim()) return "This file has no name.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

// Storage keys never contain the original file name: Bangla or special
// characters can be rejected by storage, and a random id avoids clashes.
// The layout "<user_id>/<id>.<ext>" is what the storage policies expect.
export function makeStoragePath(userId: string, id: string, fileName: string): string {
  const ext = getExtension(fileName).replace(/[^a-z0-9]/g, "").slice(0, 12);
  return ext ? `${userId}/${id}.${ext}` : `${userId}/${id}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Validates a user-typed file or folder name. Returns the cleaned name or null.
export function cleanName(value: unknown): string | null {
  const name = String(value ?? "").trim();
  if (name.length < 1 || name.length > 255) return null;
  if (/[\\/]/.test(name)) return null;
  return name;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type DocStatus = "uploaded" | "processing" | "ready" | "failed" | "skipped";
