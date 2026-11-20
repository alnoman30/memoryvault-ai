import type { Content } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { isUuid } from "@/lib/documents";
import { isAiConfigured } from "@/lib/ai/config";
import { AiRateLimitError, friendlyAiError } from "@/lib/ai/errors";
import { embedTexts, streamText } from "@/lib/ai/gemini";
import {
  MAX_MESSAGE_CHARS,
  SYSTEM_PROMPT,
  buildContextBlock,
  citedSources,
  keywordQuery,
  searchQuery,
  sourceLabel,
  titleFrom,
  toSources,
  type ChatSource,
  type RetrievedChunk,
} from "@/lib/chat";

export const maxDuration = 120;

// Streams newline-delimited JSON events:
//   { type: "meta", conversationId, title }
//   { type: "delta", text }
//   { type: "done", messageId, sources }
//   { type: "error", message }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    message?: unknown;
  } | null;

  const message = String(body?.message ?? "").trim();
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { error: `Write a message of 1 to ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 },
    );
  }
  const requestedId = isUuid(body?.conversationId) ? body.conversationId : null;

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  // Conversation: reuse the user's own one (and load its memory at the same
  // time), or start a new one.
  let conversationId: string | null = null;
  let title = titleFrom(message);
  let history: { role: string; content: string }[] = [];
  if (requestedId) {
    const [conv, past] = await Promise.all([
      supabase.from("conversations").select("id, title").eq("id", requestedId).maybeSingle(),
      supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", requestedId)
        .order("created_at", { ascending: false })
        .limit(16),
    ]);
    if (conv.data) {
      conversationId = conv.data.id as string;
      title = conv.data.title as string;
      history = (past.data ?? []).reverse();
    }
  }
  if (!conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title })
      .select("id")
      .single();
    if (error || !data) {
      return Response.json({ error: "Could not start a new chat." }, { status: 500 });
    }
    conversationId = data.id as string;
  }

  const encoder = new TextEncoder();
  const convId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      send({ type: "meta", conversationId: convId, title });

      let answer = "";
      let sources: ChatSource[] = [];
      try {
        const aiReady = isAiConfigured();
        const previousQuestion =
          [...history].reverse().find((m) => m.role === "user")?.content ?? null;
        const query = searchQuery(message, previousQuestion);

        // Save the question, search the documents and load the document list
        // at the same time.
        const search = async () => {
          let embedding: number[] | null = null;
          if (aiReady) {
            try {
              [embedding] = await embedTexts([query], "RETRIEVAL_QUERY");
            } catch (error) {
              // Busy embedding service: keyword search still works.
              if (!(error instanceof AiRateLimitError)) throw error;
            }
          }
          const { data, error } = await supabase.rpc("match_chunks", {
            query_embedding: embedding ? JSON.stringify(embedding) : null,
            query_text: keywordQuery(query),
            match_count: 10,
          });
          if (error) throw new Error(`Search failed: ${error.message}`);
          return (data ?? []) as RetrievedChunk[];
        };
        const [saved, matches, docsResult] = await Promise.all([
          supabase.from("messages").insert({ conversation_id: convId, role: "user", content: message }),
          search(),
          aiReady
            ? supabase
                .from("documents")
                .select("name, summary, page_count")
                .order("created_at", { ascending: false })
                .limit(80)
            : Promise.resolve({ data: [] }),
        ]);
        if (saved.error) throw new Error("Could not save your message.");
        sources = toSources(matches);
        const docs = docsResult.data;

        if (!aiReady) {
          answer = sources.length
            ? `The AI is not set up yet (GEMINI_API_KEY is missing), so here are the closest matches from your documents:\n\n${sources
                .slice(0, 4)
                .map((s) => `[${s.n}] ${sourceLabel(s)}: ${s.excerpt.slice(0, 240)}`)
                .join("\n\n")}`
            : "The AI is not set up yet (GEMINI_API_KEY is missing), and no document matched your words.";
          send({ type: "delta", text: answer });
        } else {
          // Ask Gemini, with the excerpts and the document list.
          const contents: Content[] = history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));
          contents.push({
            role: "user",
            parts: [
              {
                text: `${buildContextBlock(sources, docs ?? [])}\n\nUSER MESSAGE:\n${message}`,
              },
            ],
          });

          for await (const text of streamText({
            system: SYSTEM_PROMPT,
            contents,
            temperature: 0.3,
            maxOutputTokens: 2048,
          })) {
            answer += text;
            send({ type: "delta", text });
          }
          if (!answer.trim()) {
            answer = "Sorry, I could not write an answer this time. Please try again.";
            send({ type: "delta", text: answer });
          }
        }

        // Save the answer with the sources it actually cited.
        const used = citedSources(answer, sources);
        const [savedAnswer] = await Promise.all([
          supabase
            .from("messages")
            .insert({
              conversation_id: convId,
              role: "assistant",
              content: answer,
              sources: used.map(({ n, document_id, name, page }) => ({ n, document_id, name, page })),
            })
            .select("id")
            .single(),
          supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId),
        ]);

        send({
          type: "done",
          messageId: savedAnswer.data?.id ?? null,
          sources: used.map(({ n, document_id, name, page }) => ({ n, document_id, name, page })),
        });
      } catch (error) {
        console.error("Chat failed", error);
        const text = friendlyAiError(error);
        if (answer) {
          // Keep what was already written, so the chat history stays honest.
          await supabase.from("messages").insert({
            conversation_id: convId,
            role: "assistant",
            content: `${answer}\n\n(${text})`,
          });
        }
        send({ type: "error", message: text });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
