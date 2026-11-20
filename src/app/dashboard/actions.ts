"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { cleanName, isUuid } from "@/lib/documents";

type Failure = { ok: false; error: string };
export type ActionResult = { ok: true } | Failure;
export type UrlResult = { ok: true; url: string } | Failure;

const NOT_LOGGED_IN = "Your session has ended. Please sign in again.";
const BAD_NAME = "Use 1 to 255 characters, without / or \\.";
const FAILED = "Something went wrong. Please try again.";

// While developing, include the real database message so problems can be
// diagnosed. In production users only see the friendly text.
function fail(error?: { message: string } | null): Failure {
  const detail =
    process.env.NODE_ENV !== "production" && error ? ` (${error.message})` : "";
  return { ok: false, error: `${FAILED}${detail}` };
}

// Every action runs as the logged-in user, so Row Level Security in the
// database still decides what is allowed. The checks here give clear errors.
async function getContext() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  return { supabase, user };
}

export async function createFolder(
  parentId: string | null,
  name: string,
): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (parentId !== null && !isUuid(parentId)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase
    .from("folders")
    .insert({ name: clean, parent_id: parentId });
  if (error) return fail(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (!isUuid(id)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase.from("folders").update({ name: clean }).eq("id", id);
  if (error) return fail(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

// A folder is only deleted when it is empty, so nothing is lost by accident.
export async function deleteFolder(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const [subfolders, files] = await Promise.all([
    supabase.from("folders").select("id").eq("parent_id", id).limit(1),
    supabase.from("documents").select("id").eq("folder_id", id).limit(1),
  ]);
  if (subfolders.error || files.error) return fail(subfolders.error ?? files.error);

  if ((subfolders.data?.length ?? 0) > 0 || (files.data?.length ?? 0) > 0) {
    return {
      ok: false,
      error: "This folder is not empty. Move or delete what is inside it first.",
    };
  }

  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) return fail(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function renameDocument(id: string, name: string): Promise<ActionResult> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: BAD_NAME };
  if (!isUuid(id)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase.from("documents").update({ name: clean }).eq("id", id);
  if (error) return fail(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveDocument(
  id: string,
  folderId: string | null,
): Promise<ActionResult> {
  if (!isUuid(id)) return fail();
  if (folderId !== null && !isUuid(folderId)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { error } = await supabase
    .from("documents")
    .update({ folder_id: folderId })
    .eq("id", id);
  if (error) return fail(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { data: doc, error: findError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (findError || !doc) return fail(findError);

  // Delete the database row first, then the file. If removing the file
  // fails, the user just has an invisible leftover file, never a broken row.
  const { error: deleteError } = await supabase.from("documents").delete().eq("id", id);
  if (deleteError) return fail(deleteError);

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
  if (!isUuid(id)) return fail();

  const { supabase, user } = await getContext();
  if (!user) return { ok: false, error: NOT_LOGGED_IN };

  const { data: doc, error: findError } = await supabase
    .from("documents")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (findError || !doc) return fail(findError);

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(
      doc.storage_path,
      60,
      mode === "download" ? { download: doc.name } : undefined,
    );
  if (error || !data) return fail(error);

  return { ok: true, url: data.signedUrl };
}
