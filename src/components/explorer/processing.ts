"use client";

// Drives document reading from the browser: the server does one step per
// request (it must stay inside the serverless time limit), and this loop asks
// for the next step until the document is finished. If the tab is closed, the
// work simply continues the next time the vault is opened.

type StepResponse = {
  status?: string;
  retryAfterMs?: number;
  message?: string;
  error?: string;
};

const running = new Map<string, Promise<string>>();

// A tiny store so components can show which documents are being read.
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish() {
  snapshot = new Set(running.keys());
  listeners.forEach((l) => l());
}

export function subscribeProcessing(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getProcessingSnapshot = () => snapshot;
const EMPTY: ReadonlySet<string> = new Set();
export const getServerProcessingSnapshot = () => EMPTY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function processDocument(
  id: string,
  { restart = false, onWaiting }: { restart?: boolean; onWaiting?: (message: string) => void } = {},
): Promise<string> {
  const existing = running.get(id);
  if (existing && !restart) return existing;

  const job = (async () => {
    let first = true;
    let networkErrors = 0;
    for (let step = 0; step < 500; step++) {
      let result: StepResponse;
      try {
        const response = await fetch(
          `/api/documents/${id}/process${first && restart ? "?restart=1" : ""}`,
          { method: "POST" },
        );
        result = (await response.json().catch(() => ({}))) as StepResponse;
        if (!response.ok) return result.error ?? "failed";
        networkErrors = 0;
      } catch {
        if (++networkErrors > 4) return "offline";
        await sleep(5000);
        continue;
      }
      first = false;

      if (result.status !== "processing") return result.status ?? "failed";
      if (result.retryAfterMs) {
        onWaiting?.(result.message ?? "Waiting for the free AI limit…");
        await sleep(result.retryAfterMs);
      } else {
        await sleep(150);
      }
    }
    return "processing";
  })().finally(() => {
    running.delete(id);
    publish();
  });

  running.set(id, job);
  publish();
  return job;
}
