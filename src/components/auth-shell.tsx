import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Brand } from "@/components/ui/logo";

const points = [
  "Every account is isolated. Nobody else can read your files.",
  "Ask in Bangla or English, even years later.",
  "Answers point to the document and page they came from.",
];

// Two-column frame for sign in / sign up: an inverted brand panel + the form.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-bg lg:flex lg:flex-col lg:justify-between">
        <svg
          className="pointer-events-none absolute -bottom-72 -right-72 opacity-70"
          width="620"
          height="620"
          viewBox="0 0 620 620"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="310" cy="310" r="300" stroke="var(--accent)" strokeWidth="2" opacity="0.35" />
          <circle cx="310" cy="310" r="230" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
          <circle cx="310" cy="310" r="160" stroke="var(--accent)" strokeWidth="3" />
          <circle cx="310" cy="310" r="26" fill="var(--accent)" />
          {Array.from({ length: 24 }).map((_, i) => (
            <line
              key={i}
              x1="310"
              y1="14"
              x2="310"
              y2={i % 6 === 0 ? 52 : 34}
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              transform={`rotate(${i * 15} 310 310)`}
              opacity="0.75"
            />
          ))}
        </svg>

        <Brand />

        <div className="relative max-w-md">
          <h2 className="font-display text-5xl font-semibold leading-[1.02] tracking-tight">
            Your papers, safe and <em className="text-accent">findable</em> for years.
          </h2>
          <ul className="mt-8 flex flex-col gap-3.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[0.95rem] opacity-85">
                <Check className="mt-0.5 h-[1.1rem] w-[1.1rem] shrink-0 text-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-xs uppercase tracking-[0.18em] opacity-50">
          Private · Multilingual · Cited
        </p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg py-1 text-sm text-muted transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <Brand className="lg:hidden" />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
