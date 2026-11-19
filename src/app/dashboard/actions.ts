"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanName, isUuid } from "@/lib/documents";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

const NOT_LOGGED_IN = "আবার লগইন করুন। / Please log in again.";
const BAD_NAME =
  "নাম ১-২৫৫ অক্ষরের হতে হবে, / বা \\ থাকা যাবে না। / Name must be 1-255 characters, without / or \\.";
const FAILED = "কাজটি করা যায়নি। আবার চেষ্টা করুন। / Something went wrong. Try again.";

// Every action runs as the logged-in user, so Row Level Security in the
// database still decides what is allowed. The checks here give clear errors.
async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createFolder(
  parentId: string | null,
  name: string,
): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (parentId !== null && !isUuid(parentId)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase
    .from("folders")
    .insert({ name: clean, parent_id: parentId });
  if (error) return { ok: false, error: FAILED };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (!isUuid(id)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase.from("folders").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: FAILED };

  revalidatePath("/dashboard");
  return { ok: true };
}

// A folder is only deleted when it is empty, so nothing is lost by accident.
export async function deleteFolder(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const [subfolders, files] = await Promise.all([
    supabase.from("folders").select("id").eq("parent_id", id).limit(1),
    supabase.from("documents").select("id").eq("folder_id", id).limit(1),
  ]);
  if (subfolders.error || files.error) return { ok: false, error: FAILED };

  if ((subfolders.data?.length ?? 0) > 0 || (files.data?.length ?? 0) > 0) {
    return {
      ok: false,
      error:
        "ফোল্ডারটি ফাঁকা নয়। আগে ভেতরের জিনিস সরান বা মুছুন। / The folder is not empty. Move or delete its contents first.",
    };
  }

  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) return { ok: false, error: FAILED };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function renameDocument(id: string, name: string): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (!isUuid(id)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase.from("documents").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: FAILED };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveDocument(
  id: string,
  folderId: string | null,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: FAILED };
  if (folderId !== null && !isUuid(folderId)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase
    .from("documents")
    .update({ folder_id: folderId })
    .eq("id", id);
  if (error) return { ok: false, error: FAILED };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { data: doc, error: findError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (findError || !doc) return { ok: false, error: FAILED };

  // Delete the database row first, then the file. If removing the file
  // fails, the user just has an invisible leftover file, never a broken row.
  const { error: deleteError } = await supabase.from("documents").delete().eq("id", id);
  if (deleteError) return { ok: false, error: FAILED };

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([doc.storage_path]);
  if (storageError) {
    console.error("Storage cleanup failed for a deleted document", storageError.message);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

// Short-lived link (60 seconds) so the private file can be opened or saved.
export async function getDocumentUrl(
  id: string,
  mode: "preview" | "download",
): Promise<UrlResult> {
  if (!isUuid(id)) return { ok: false, error: FAILED };

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { data: doc, error: findError } = await supabase
    .from("documents")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (findError || !doc) return { ok: false, error: FAILED };

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(
      doc.storage_path,
      60,
      mode === "download" ? { download: doc.name } : undefined,
    );
  if (error || !data) return { ok: false, error: FAILED };

  return { ok: true, url: data.signedUrl };
}
