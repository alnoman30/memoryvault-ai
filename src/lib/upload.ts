"use client";

import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Uploads go straight from the browser to the private Supabase bucket.
// Small files use one request; large files use resumable (TUS) uploads in
// 6 MB pieces, which survive bad connections and have no app-side size limit.
// The only limit is Supabase's own "Global file size limit"
// (Free plan: 50 MB per file, paid plans: up to 500 GB).

const SMALL_FILE = 6 * 1024 * 1024;

export const TOO_BIG_MESSAGE =
  "This file is bigger than your Supabase project allows. On the Free plan the limit is 50 MB per file. Raise it in Supabase > Storage > Settings (paid plans allow up to 500 GB).";

function friendly(status: number | null, body: string): string {
  if (status === 413 || /maximum allowed size|too large|payload too large/i.test(body)) {
    return TOO_BIG_MESSAGE;
  }
  if (status === 401 || status === 403) return "Upload not allowed. Please sign in again.";
  return "Upload failed. Check your connection and try again.";
}

export async function uploadFile({
  supabase,
  file,
  path,
  onProgress,
}: {
  supabase: SupabaseClient;
  file: File;
  path: string;
  onProgress: (fraction: number) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const contentType = file.type || "application/octet-stream";

  if (file.size <= SMALL_FILE) {
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, file, { contentType, upsert: false });
    onProgress(1);
    if (error) {
      const status = Number((error as { statusCode?: string | number }).statusCode) || null;
      return { ok: false, error: friendly(status, error.message) };
    }
    return { ok: true };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Your session has ended. Please sign in again." };

  return new Promise((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      // Every upload gets a fresh random path, so old sessions are not reused.
      storeFingerprintForResuming: false,
      metadata: {
        bucketName: "documents",
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      chunkSize: SMALL_FILE, // Supabase requires exactly 6 MB pieces
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve({ ok: true }),
      onError: (error) => {
        const response = (error as tus.DetailedError).originalResponse;
        const status = response?.getStatus() ?? null;
        const body = response?.getBody() ?? error.message;
        resolve({ ok: false, error: friendly(status, body ?? "") });
      },
    });
    upload.start();
  });
}
