"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { deleteAllChats, failedDocumentIds, updateDisplayName } from "@/app/settings/actions";
import { processDocument } from "@/components/explorer/processing";
import { btn, inputClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";

type Props = {
  email: string;
  displayName: string;
  ai: {
    configured: boolean;
    chatModel: string;
    readerModel: string;
    embeddingModel: string;
    maxReadMb: number;
  };
  stats: {
    total: number;
    ready: number;
    reading: number;
    failed: number;
    storedOnly: number;
    chats: number;
  };
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-raised p-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsView({ email, displayName, ai, stats }: Props) {
  const [name, setName] = useState(displayName);
  const [saving, startSave] = useTransition();
  const [retrying, setRetrying] = useState(false);
  const [clearing, startClear] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const result = await updateDisplayName(name);
      toast(result.ok ? "Name saved" : result.error, result.ok ? "success" : "error");
    });
  }

  async function retryFailed() {
    setRetrying(true);
    const ids = await failedDocumentIds();
    toast(`Reading ${ids.length} document${ids.length === 1 ? "" : "s"} again…`, "info");
    await Promise.all(ids.map((id) => processDocument(id, { restart: true })));
    setRetrying(false);
    router.refresh();
  }

  function clearChats() {
    if (!window.confirm("Delete every chat? Your documents are not touched.")) return;
    startClear(async () => {
      const result = await deleteAllChats();
      toast(result.ok ? "Chat history deleted" : result.error, result.ok ? "success" : "error");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
        <p className="mt-2 text-sm text-muted">{email}</p>
      </div>

      <Card title="Profile">
        <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium">
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Your name"
              className={`${inputClass} mt-2`}
            />
          </label>
          <button type="submit" disabled={saving || name === displayName} className={btn("primary")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </form>
      </Card>

      <Card title="AI assistant">
        <p className="flex items-center gap-2 text-sm font-medium">
          {ai.configured ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-ok" /> Connected to Google Gemini
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-danger" /> Not set up
            </>
          )}
        </p>
        {!ai.configured && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface p-4 text-sm text-muted">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            Create a free key at aistudio.google.com, then add it as GEMINI_API_KEY in your
            server settings (Vercel: Project → Settings → Environment Variables) and redeploy.
          </p>
        )}
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Chat model</dt>
          <dd className="font-mono text-xs leading-5">{ai.chatModel}</dd>
          <dt className="text-muted">Reading model</dt>
          <dd className="font-mono text-xs leading-5">{ai.readerModel}</dd>
          <dt className="text-muted">Search model</dt>
          <dd className="font-mono text-xs leading-5">{ai.embeddingModel}</dd>
          <dt className="text-muted">AI reads files up to</dt>
          <dd>{ai.maxReadMb} MB (bigger files are stored only)</dd>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          On the free Gemini plan Google may use what is sent to improve its products, and there
          are daily limits. When a limit is reached, reading pauses and continues automatically.
        </p>
      </Card>

      <Card title="Documents">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Total", stats.total],
            ["Ready", stats.ready],
            ["Being read", stats.reading],
            ["Failed", stats.failed],
            ["Stored only", stats.storedOnly],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={retryFailed}
          disabled={retrying || stats.failed === 0}
          className={`${btn("secondary")} mt-4`}
        >
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Read failed documents again
        </button>
      </Card>

      <Card title="Chat history">
        <p className="text-sm text-muted">
          {stats.chats} saved {stats.chats === 1 ? "chat" : "chats"}. The assistant remembers
          earlier messages inside each chat.
        </p>
        <button
          type="button"
          onClick={clearChats}
          disabled={clearing || stats.chats === 0}
          className={`${btn("secondary")} mt-4 text-danger`}
        >
          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete all chats
        </button>
      </Card>
    </div>
  );
}
