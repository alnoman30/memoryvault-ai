export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB (matches the storage bucket limit)

// Supabase free plan: 1 GB of file storage for the whole project.
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "txt",
  "md",
  "csv",
  "docx",
] as const;

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

// Returns a short error message, or null if the file is acceptable.
export function validateUpload(file: { name: string; size: number }): string | null {
  const ext = getExtension(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Unsupported file type. Use PDF, PNG, JPG, WEBP, TXT, MD, CSV or DOCX.";
  }
  if (file.size === 0) {
    return "This file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "This file is larger than 20 MB.";
  }
  return null;
}

// Storage keys never contain the original file name: Bangla or special
// characters can be rejected by storage, and a random id avoids clashes.
// The layout "<user_id>/<id>.<ext>" is what the storage policies expect.
export function makeStoragePath(userId: string, id: string, fileName: string): string {
  const ext = getExtension(fileName).replace(/[^a-z0-9]/g, "");
  return ext ? `${userId}/${id}.${ext}` : `${userId}/${id}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
