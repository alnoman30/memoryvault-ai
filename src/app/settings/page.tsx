import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell, ShellSkeleton } from "@/components/app/app-shell";
import { SettingsView } from "@/components/settings/settings-view";
import { createClient } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai/config";

export const metadata = { title: "Settings · MemoryVault" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SettingsWorkspace />
    </Suspense>
  );
}

async function SettingsWorkspace() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, docs, chats] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("documents").select("status, size_bytes"),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
  ]);

  const rows = docs.data ?? [];
  const count = (status: string) => rows.filter((d) => d.status === status).length;
  const ai = getAiConfig();

  return (
    <AppShell
      email={user.email ?? ""}
      usedBytes={rows.reduce((s, d) => s + (d.size_bytes ?? 0), 0)}
      active="settings"
    >
      <SettingsView
        email={user.email ?? ""}
        displayName={profile.data?.display_name ?? ""}
        ai={{
          configured: ai.apiKey !== null,
          chatModel: ai.chatModels[0],
          readerModel: ai.readerModels[0],
          embeddingModel: ai.embeddingModel,
          maxReadMb: Math.round(ai.maxReadBytes / 1048576),
        }}
        stats={{
          total: rows.length,
          ready: count("ready"),
          reading: count("uploaded") + count("processing"),
          failed: count("failed"),
          storedOnly: count("skipped"),
          chats: chats.count ?? 0,
        }}
      />
    </AppShell>
  );
}
