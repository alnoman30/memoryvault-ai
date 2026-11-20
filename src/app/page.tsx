import Link from "next/link";
import { ArrowRight, FileText, IdCard, MessageSquareText, Receipt } from "lucide-react";
import { Brand } from "@/components/ui/logo";
import { btn } from "@/components/ui/styles";


export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <nav className="flex items-center gap-1.5">
          <Link href="/login" className={btn("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/signup" className={btn("primary", "sm")}>
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mv-dots relative">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3.5 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Private document memory
            </p>
            <h1 className="mt-6 font-display text-[3.1rem] font-semibold leading-[0.95] tracking-tight sm:text-7xl">
              Every document,
              <br />
              <em className="text-accent">remembered.</em>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Keep IDs, contracts and receipts in one private vault. Ask a question in Bangla or
              English, even years later, and get the answer with the document and page it came from.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={btn("primary", "lg")}>
                Create your vault
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className={btn("secondary", "lg")}>
                Sign in
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">Free to start. Your files stay in your own private storage.</p>
          </div>

          {/* Illustration: a loose stack of documents and an example question */}
          <div className="mx-auto flex w-full max-w-md flex-col gap-3.5" aria-hidden="true">
            <div className="w-[82%] -rotate-2 self-start rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok">
                  <IdCard className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">National ID card</p>
                  <p className="text-xs text-muted">Photo · read by AI</p>
                </div>
              </div>
            </div>
            <div className="w-[82%] rotate-1 self-end rounded-2xl border border-line bg-raised p-4 shadow-[var(--shadow)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger-soft text-danger">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Rental agreement</p>
                  <p className="text-xs text-muted">PDF · 12 pages</p>
                </div>
              </div>
            </div>
            <div className="w-[70%] -rotate-1 self-start rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Receipt className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Tax receipt 2026</p>
                  <p className="text-xs text-muted">JPG · 1 page</p>
                </div>
              </div>
            </div>

            <div className="mt-2 rounded-2xl border border-line bg-ink p-5 text-bg shadow-[var(--shadow)]">
              <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] opacity-70">
                <MessageSquareText className="h-3.5 w-3.5" />
                Ask your vault
              </p>
              <p className="mt-3 text-sm opacity-80">When does my lease end?</p>
              <p className="mt-2 text-sm leading-relaxed">
                It ends on 31 March 2028.{" "}
                <span className="whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 font-mono text-[0.68rem] text-accent-ink">
                  Rental agreement · p. 4
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto mt-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pb-10 text-sm text-muted sm:px-8">
        <Brand className="opacity-80" />
        <p>Built step by step. Your documents are yours.</p>
      </footer>
    </div>
  );
}
