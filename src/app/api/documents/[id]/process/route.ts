import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/documents";
import { runProcessingStep } from "@/lib/processing";

// One processing step for one document (see src/lib/processing.ts).
// Vercel Hobby allows up to 300 seconds; each step stops well before that.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/process">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown document." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const restart = new URL(request.url).searchParams.get("restart") === "1";

  try {
    const result = await runProcessingStep(supabase, user.id, id, { restart });
    return Response.json(result);
  } catch (error) {
    console.error("Processing step crashed", error);
    return Response.json({ error: "Could not process this document." }, { status: 500 });
  }
}
