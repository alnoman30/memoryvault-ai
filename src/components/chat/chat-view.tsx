"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  FileText,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { getDocumentUrl } from "@/app/dashboard/actions";
import { deleteConversation } from "@/app/chat/actions";
import { LogoMark } from "@/components/ui/logo";
import { btn } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { RichText } from "./rich-text";

export type SourceRef = { n: number; document_id: string; name: string; page: number | null };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  pending?: boolean;
  failed?: boolean;
};

type Props = {
  conversationId: string | null;
  conversations: { id: string; title: string }[];
  initialMessages: ChatMessage[];
  aiReady: boolean;
  documentCount: number;
  readingCount: number;
};

const SUGGESTIONS = [
  "আমার কী কী ডকুমেন্ট আছে?",
  "When does my rental agreement end?",
  "আমার NID নম্বর কত?",
  "Summarise my latest receipt.",
];

// Opens a private file in a new tab (PDFs jump to the cited page).
async function openSource(source: SourceRef, onError: (m: string) => void) {
  const tab = window.open("about:blank", "_blank");
  const result = await getDocumentUrl(source.document_id, "preview");
  if (!result.ok) {
    tab?.close();
    onError(result.error);
    return;
  }
  const url = source.page ? `${result.url}#page=${source.page}` : result.url;
  if (tab) tab.location.href = url;
  else window.location.assign(url);
}

export function ChatView({
  conversationId,
  conversations,
  initialMessages,
  aiReady,
  documentCount,
  readingCount,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, startDelete] = useTransition();
  const convRef = useRef<string | null>(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function patchLast(change: (m: ChatMessage) => ChatMessage) {
    setMessages((list) => {
      const copy = [...list];
      copy[copy.length - 1] = change(copy[copy.length - 1]);
      return copy;
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    setMessages((list) => [
      ...list,
      { id: crypto.randomUUID(), role: "user", content: message, sources: [] },
      { id: crypto.randomUUID(), role: "assistant", content: "", sources: [], pending: true },
    ]);

    let newConversation: string | null = null;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convRef.current, message }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The assistant could not answer. Please try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "meta"; conversationId: string }
            | { type: "delta"; text: string }
            | { type: "done"; sources: SourceRef[] }
            | { type: "error"; message: string };
          if (event.type === "meta") {
            if (convRef.current !== event.conversationId) newConversation = event.conversationId;
            convRef.current = event.conversationId;
          } else if (event.type === "delta") {
            patchLast((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "done") {
            patchLast((m) => ({ ...m, pending: false, sources: event.sources }));
          } else if (event.type === "error") {
            patchLast((m) => ({
              ...m,
              pending: false,
              failed: true,
              content: m.content ? `${m.content}\n\n${event.message}` : event.message,
            }));
          }
        }
      }
    } catch (error) {
      patchLast((m) => ({
        ...m,
        pending: false,
        failed: true,
        content: error instanceof Error ? error.message : "Something went wrong.",
      }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setSending(false);
      inputRef.current?.focus();
      if (newConversation) router.replace(`/chat?c=${newConversation}`, { scroll: false });
      else router.refresh();
    }
  }

  function remove(id: string) {
    startDelete(async () => {
      const result = await deleteConversation(id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Chat deleted");
      if (id === convRef.current) router.replace("/chat");
      else router.refresh();
    });
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 lg:h-dvh">
      {/* Conversation list (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-bg/60 xl:flex">
        <div className="p-4">
          <Link href="/chat" className={`${btn("secondary")} w-full`}>
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Link>
        </div>
        <p className="px-5 pb-2 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
          History
        </p>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {conversations.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No chats yet.</li>
          )}
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <Link
                href={`/chat?c=${c.id}`}
                className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm transition ${
                  c.id === conversationId ? "bg-surface font-medium text-ink" : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {c.title}
              </Link>
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={deleting}
                aria-label={`Delete chat ${c.title}`}
                className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted opacity-0 transition hover:bg-line/60 hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <MessageSquareText className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Searching {documentCount} {documentCount === 1 ? "document" : "documents"}
              {readingCount > 0 ? ` · ${readingCount} still being read` : ""}
            </span>
          </p>
          <div className="flex items-center gap-1 xl:hidden">
            {conversationId && (
              <button
                type="button"
                onClick={() => remove(conversationId)}
                aria-label="Delete this chat"
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <Link href="/chat" className={btn("ghost", "sm")}>
              <MessageSquarePlus className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
            {!aiReady && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                The AI is not set up yet. Add GEMINI_API_KEY to the server settings (see the README).
                Until then, the chat only shows matching passages.
              </p>
            )}

            {empty && (
              <div className="flex flex-col items-center pt-10 text-center">
                <LogoMark size={52} />
                <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight">
                  Ask your vault
                </h1>
                <p className="mt-3 max-w-md text-muted">
                  Ask in Bangla or English. Every answer points to the document and page it came
                  from.
                </p>
                {documentCount === 0 && (
                  <p className="mt-4 text-sm">
                    <Link href="/dashboard" className="font-medium text-accent underline underline-offset-4">
                      Upload a document first
                    </Link>
                  </p>
                )}
                <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-2xl border border-line bg-raised px-4 py-3 text-left text-sm transition hover:border-accent/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-ink px-4 py-3 text-[0.95rem] text-bg">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <span className="mt-1 shrink-0">
                    <LogoMark size={28} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {m.pending && !m.content ? (
                      <p className="flex items-center gap-2 py-1 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Looking through your documents…
                      </p>
                    ) : (
                      <div className={m.failed ? "text-danger" : ""}>
                        <RichText
                          text={m.content}
                          sources={m.sources}
                          onCite={(s) => openSource(s, (e) => toast(e, "error"))}
                        />
                      </div>
                    )}
                    {m.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.sources.map((s) => (
                          <button
                            key={`${s.n}-${s.document_id}`}
                            type="button"
                            onClick={() => openSource(s, (e) => toast(e, "error"))}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-xs transition hover:border-accent hover:text-accent"
                          >
                            <span className="font-mono text-accent">{s.n}</span>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {s.name}
                              {s.page ? ` · p. ${s.page}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-line bg-bg/80 px-4 py-4 backdrop-blur sm:px-8"
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-line bg-raised p-2 shadow-[var(--shadow)] focus-within:border-accent">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Ask anything about your documents… (বাংলাতেও লিখতে পারেন)"
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted/70 [field-sizing:content]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted">
            AI can make mistakes. Check important details in the cited document.
          </p>
        </form>
      </section>
    </div>
  );
}
