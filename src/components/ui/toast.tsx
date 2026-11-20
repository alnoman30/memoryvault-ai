"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(
  () => {},
);

export const useToast = () => useContext(ToastContext);

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const colors = {
  success: "text-ok",
  error: "text-danger",
  info: "text-accent",
};

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = ++counter;
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
      >
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-raised px-4 py-3 text-sm shadow-[var(--shadow)] [animation:mv-toast_0.25s_ease-out]"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${colors[t.tone]}`} />
              <p className="min-w-0 flex-1 break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-muted transition hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
