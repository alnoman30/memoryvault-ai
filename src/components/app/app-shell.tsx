import { FolderOpen, LogOut, MessageSquareText, Settings } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { Brand } from "@/components/ui/logo";
import { FREE_STORAGE_BYTES, formatBytes } from "@/lib/documents";

type ShellProps = {
  email: string;
  usedBytes: number;
  children: React.ReactNode;
};

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        aria-label="Sign out"
        className={
          compact
            ? "grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-line/50 hover:text-ink"
            : "grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink"
        }
      >
        <LogOut className="h-[1.1rem] w-[1.1rem]" />
      </button>
    </form>
  );
}

// Page frame for signed-in screens: sidebar on desktop, slim top bar on phones.
export function AppShell({ email, usedBytes, children }: ShellProps) {
  const percent = Math.min(100, (usedBytes / FREE_STORAGE_BYTES) * 100);
  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <SignOutButton compact />
      </header>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col justify-between border-r border-line bg-surface px-5 py-6 lg:flex">
        <div>
          <Brand />

          <nav aria-label="Main" className="mt-10 flex flex-col gap-1">
            <span
              aria-current="page"
              className="flex items-center gap-3 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-medium text-accent-ink"
            >
              <FolderOpen className="h-[1.1rem] w-[1.1rem]" />
              Files
            </span>
            <span
              aria-disabled="true"
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-muted"
            >
              <MessageSquareText className="h-[1.1rem] w-[1.1rem]" />
              <span className="flex-1">AI chat</span>
              <span className="rounded-full bg-line/60 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider">
                Soon
              </span>
            </span>
            <span
              aria-disabled="true"
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-muted"
            >
              <Settings className="h-[1.1rem] w-[1.1rem]" />
              <span className="flex-1">Settings</span>
              <span className="rounded-full bg-line/60 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider">
                Soon
              </span>
            </span>
          </nav>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-line bg-raised p-4">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
              Storage
            </p>
            <p className="mt-2 text-sm font-medium">
              {formatBytes(usedBytes) || "0 B"}{" "}
              <span className="font-normal text-muted">of 1 GB</span>
            </p>
            <div
              role="progressbar"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.max(percent, usedBytes > 0 ? 2 : 0)}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              The free plan allows 1 GB for the whole project.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{email}</p>
              <p className="text-xs text-muted">Private account</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
    </div>
  );
}

// Shown while the workspace loads.
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface px-5 py-6 lg:block">
        <Brand />
        <div className="mt-10 flex flex-col gap-2">
          <div className="mv-skeleton h-10" />
          <div className="mv-skeleton h-10 opacity-60" />
          <div className="mv-skeleton h-10 opacity-60" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mv-skeleton h-5 w-40" />
          <div className="mv-skeleton mt-5 h-12 w-72" />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="mv-skeleton h-[4.5rem]" />
            <div className="mv-skeleton h-[4.5rem]" />
            <div className="mv-skeleton h-[4.5rem]" />
          </div>
          <div className="mv-skeleton mt-8 h-64" />
        </div>
      </main>
    </div>
  );
}
