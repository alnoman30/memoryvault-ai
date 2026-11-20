"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
};

// A "..." button that opens a small popup menu.
export function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink aria-expanded:bg-line/60 aria-expanded:text-ink"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-48 origin-top-right overflow-hidden rounded-2xl border border-line bg-raised p-1.5 shadow-[var(--shadow)] [animation:mv-menu_0.14s_ease-out]"
        >
          {items.map(({ label: text, icon: Icon, onSelect, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-surface ${
                danger ? "text-danger" : "text-ink"
              }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
