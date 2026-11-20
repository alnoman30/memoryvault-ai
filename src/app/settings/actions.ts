"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/dashboard/actions";

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateDisplayName(name: string): Promise<ActionResult> {
  const clean = name.trim().slice(0, 100);
  const { supabase, user } = await context();
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: clean || null })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your name." };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteAllChats(): Promise<ActionResult> {
  const { supabase, user } = await context();
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const { error } = await supabase.from("conversations").delete().eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not delete the chat history." };
  revalidatePath("/chat");
  revalidatePath("/settings");
  return { ok: true };
}

// Ids of documents that should be read again (failed ones).
export async function failedDocumentIds(): Promise<string[]> {
  const { supabase, user } = await context();
  if (!user) return [];
  const { data } = await supabase.from("documents").select("id").eq("status", "failed");
  return (data ?? []).map((d) => d.id as string);
}
