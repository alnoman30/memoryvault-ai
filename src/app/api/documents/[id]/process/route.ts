import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { isUuid } from "@/lib/documents";
import { runProcessingStep } from "@/lib/processing";

// One processing step for one document (see src/lib/processing.ts).
// Vercel Hobby allows up to 300 seconds; each step stops well before that.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/process">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown document." }, { status: 400 });

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const restart = new URL(request.url).searchParams.get("restart") === "1";

  try {
    const { background, ...result } = await runProcessingStep(supabase, user.id, id, { restart });
    if (background) after(background);
    return Response.json(result);
  } catch (error) {
    console.error("Processing step crashed", error);
    return Response.json({ error: "Could not process this document." }, { status: 500 });
  }
}
