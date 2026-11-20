"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { cleanName, isUuid } from "@/lib/documents";
import type { ActionResult } from "@/app/dashboard/actions";

export async function deleteConversation(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Unknown chat." };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete this chat." };
  revalidatePath("/chat");
  return { ok: true };
}

export async function renameConversation(id: string, title: string): Promise<ActionResult> {
  const clean = cleanName(title)?.slice(0, 200);
  if (!isUuid(id) || !clean) return { ok: false, error: "Use 1 to 200 characters." };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const { error } = await supabase.from("conversations").update({ title: clean }).eq("id", id);
  if (error) return { ok: false, error: "Could not rename this chat." };
  revalidatePath("/chat");
  return { ok: true };
}
