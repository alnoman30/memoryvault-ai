"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** CSS width, e.g. "28rem". */
  width?: string;
  children: React.ReactNode;
};

// A popup built on the native <dialog> element: focus is trapped inside,
// Escape closes it, and the page behind cannot be clicked.
// Content is only mounted while open, so every form starts fresh.
export function Modal({
  open,
  onClose,
  title,
  description,
  width = "28rem",
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="mv-modal"
      style={{ "--mv-w": width } as React.CSSProperties}
      aria-labelledby={titleId}
      onClose={onClose}
      // A press on the dimmed backdrop (the dialog element itself) closes it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-display text-2xl font-semibold tracking-tight"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          {children}
        </>
      )}
    </dialog>
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface/60 px-6 py-4">
      {children}
    </footer>
  );
}

// Focuses an input shortly after a modal opens. (The dialog itself is shown a
// moment after its content mounts, so an immediate focus() would be lost.)
export function useAutoFocus<T extends HTMLInputElement>(selectText = false) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      ref.current?.focus();
      if (selectText) ref.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [selectText]);
  return ref;
}
