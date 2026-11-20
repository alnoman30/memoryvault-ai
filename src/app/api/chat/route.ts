import type { Content } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  // Conversation: reuse the user's own one, or start a new one.
  let conversationId = requestedId;
  let title = titleFrom(message);
  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, title")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data) conversationId = null;
    else title = data.title;
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

  // Earlier messages are the chat's memory.
  const { data: historyRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(16);
  const history = (historyRows ?? []).reverse();

  const { error: saveError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message });
  if (saveError) return Response.json({ error: "Could not save your message." }, { status: 500 });

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

        // 1. Search the user's documents (meaning + keywords).
        let embedding: number[] | null = null;
        if (aiReady) {
          try {
            [embedding] = await embedTexts([query], "RETRIEVAL_QUERY");
          } catch (error) {
            // Busy embedding service: keyword search still works.
            if (!(error instanceof AiRateLimitError)) throw error;
          }
        }
        const { data: matches, error: searchError } = await supabase.rpc("match_chunks", {
          query_embedding: embedding ? JSON.stringify(embedding) : null,
          query_text: keywordQuery(query),
          match_count: 10,
        });
        if (searchError) throw new Error(`Search failed: ${searchError.message}`);
        sources = toSources((matches ?? []) as RetrievedChunk[]);

        if (!aiReady) {
          answer = sources.length
            ? `The AI is not set up yet (GEMINI_API_KEY is missing), so here are the closest matches from your documents:\n\n${sources
                .slice(0, 4)
                .map((s) => `[${s.n}] ${sourceLabel(s)}: ${s.excerpt.slice(0, 240)}`)
                .join("\n\n")}`
            : "The AI is not set up yet (GEMINI_API_KEY is missing), and no document matched your words.";
          send({ type: "delta", text: answer });
        } else {
          // 2. Ask Gemini, with the excerpts and the document list.
          const { data: docs } = await supabase
            .from("documents")
            .select("name, summary, page_count")
            .order("created_at", { ascending: false })
            .limit(80);

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

        // 3. Save the answer with the sources it actually cited.
        const used = citedSources(answer, sources);
        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            role: "assistant",
            content: answer,
            sources: used.map(({ n, document_id, name, page }) => ({ n, document_id, name, page })),
          })
          .select("id")
          .single();
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", convId);

        send({
          type: "done",
          messageId: saved?.id ?? null,
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
