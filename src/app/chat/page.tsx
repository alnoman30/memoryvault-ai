import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell, ShellSkeleton } from "@/components/app/app-shell";
import { ChatView, type ChatMessage } from "@/components/chat/chat-view";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/config";
import { isUuid } from "@/lib/documents";

export const metadata = { title: "AI chat · MemoryVault" };

export default function ChatPage({ searchParams }: PageProps<"/chat">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ChatWorkspace searchParams={searchParams} />
    </Suspense>
  );
}

async function ChatWorkspace({ searchParams }: { searchParams: PageProps<"/chat">["searchParams"] }) {
  await connection();
  const { c } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [conversationsResult, docsResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase.from("documents").select("size_bytes, status"),
  ]);

  const conversations = conversationsResult.data ?? [];
  const requested = typeof c === "string" && isUuid(c) ? c : null;
  const currentId = requested && conversations.some((x) => x.id === requested) ? requested : null;

  let messages: ChatMessage[] = [];
  if (currentId) {
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, sources")
      .eq("conversation_id", currentId)
      .order("created_at");
    messages = (data ?? []).map((m) => ({
      id: m.id as string,
      role: m.role as ChatMessage["role"],
      content: m.content as string,
      sources: (m.sources ?? []) as ChatMessage["sources"],
    }));
  }

  const docs = docsResult.data ?? [];
  const usedBytes = docs.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);

  return (
    <AppShell email={user.email ?? ""} usedBytes={usedBytes} active="chat" bare>
      <ChatView
        key={currentId ?? "new"}
        conversationId={currentId}
        conversations={conversations.map((x) => ({ id: x.id, title: x.title }))}
        initialMessages={messages}
        aiReady={isAiConfigured()}
        documentCount={docs.length}
        readingCount={docs.filter((d) => d.status === "uploaded" || d.status === "processing").length}
      />
    </AppShell>
  );
}
