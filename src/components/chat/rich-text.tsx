"use client";

import { Fragment } from "react";
import type { SourceRef } from "./chat-view";

// A very small, safe formatter for assistant answers: paragraphs, bullet and
// numbered lists, **bold**, and [1] citation markers. No HTML is ever injected.

function Inline({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: SourceRef[];
  onCite: (s: SourceRef) => void;
}) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d{1,2}\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const cite = part.match(/^\[(\d{1,2})\]$/);
        if (cite) {
          const source = sources.find((s) => s.n === Number(cite[1]));
          if (!source) return null; // drop numbers that point nowhere
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCite(source)}
              title={source.page ? `${source.name}, page ${source.page}` : source.name}
              className="mx-0.5 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded-md bg-accent-soft px-1 align-middle font-mono text-[0.7rem] font-medium text-accent transition hover:bg-accent hover:text-accent-ink"
            >
              {source.n}
            </button>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function RichText({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: SourceRef[];
  onCite: (s: SourceRef) => void;
}) {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 text-[0.97rem] leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (bullets || numbered) {
          const Tag = numbered ? "ol" : "ul";
          return (
            <Tag key={i} className={`flex flex-col gap-1 pl-5 ${numbered ? "list-decimal" : "list-disc"}`}>
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")} sources={sources} onCite={onCite} />
                </li>
              ))}
            </Tag>
          );
        }
        const heading = lines.length === 1 && /^#{1,4}\s+/.test(lines[0]);
        if (heading) {
          return (
            <p key={i} className="font-semibold">
              <Inline text={lines[0].replace(/^#{1,4}\s+/, "")} sources={sources} onCite={onCite} />
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            <Inline text={lines.join("\n")} sources={sources} onCite={onCite} />
          </p>
        );
      })}
    </div>
  );
}
