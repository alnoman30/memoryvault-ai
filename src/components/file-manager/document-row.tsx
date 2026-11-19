"use client";

import { useState, useTransition } from "react";
import { Download, Eye, FileText, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import {
  deleteDocument,
  getDocumentUrl,
  moveDocument,
  renameDocument,
} from "@/app/dashboard/actions";
import { formatBytes } from "@/lib/documents";

export type DocumentItem = {
  id: string;
  name: string;
  size_bytes: number | null;
  is_sensitive: boolean;
  folder_id: string | null;
  dateLabel: string;
};

export function DocumentRow({
  doc,
  folderOptions,
}: {
  doc: DocumentItem;
  folderOptions: { id: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await renameDocument(doc.id, value);
      if (result.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        `"${doc.name}" মুছবেন? এটা আর ফেরত আনা যাবে না। / Delete this file? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteDocument(doc.id);
      if (!result.ok) setError(result.error);
    });
  }

  function move(folderId: string) {
    startTransition(async () => {
      const result = await moveDocument(doc.id, folderId === "" ? null : folderId);
      if (!result.ok) setError(result.error);
    });
  }

  function open(mode: "preview" | "download") {
    // Open the tab right away (browsers block pop-ups opened after waiting).
    const tab = mode === "preview" ? window.open("about:blank", "_blank") : null;
    startTransition(async () => {
      const result = await getDocumentUrl(doc.id, mode);
      if (!result.ok) {
        tab?.close();
        setError(result.error);
        return;
      }
      setError(null);
      if (tab) {
        tab.opener = null;
        tab.location.href = result.url;
      } else {
        window.location.assign(result.url);
      }
    });
  }

  return (
    <li className="rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              maxLength={255}
              className="w-full rounded border bg-background px-2 py-1 text-sm"
            />
          ) : (
            <p className="truncate font-medium">{doc.name}</p>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatBytes(doc.size_bytes)}</span>
            <span>{doc.dateLabel}</span>
            {doc.is_sensitive && (
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                Sensitive
              </span>
            )}
          </p>
        </div>

        {editing ? (
          <div className="flex gap-3">
            <button onClick={save} disabled={pending} className="text-sm underline">
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue(doc.name);
                setError(null);
              }}
              className="text-sm text-muted-foreground underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => open("preview")}
              disabled={pending}
              aria-label="Preview"
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => open("download")}
              disabled={pending}
              aria-label="Download"
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(true)}
              aria-label="Rename"
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={remove}
              disabled={pending}
              aria-label="Delete"
              className="p-1 text-muted-foreground hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        Move to / সরান:
        <select
          value={doc.folder_id ?? ""}
          onChange={(e) => move(e.target.value)}
          disabled={pending}
          className="min-w-0 rounded border bg-background px-2 py-1 text-xs text-foreground"
        >
          <option value="">Main list / মূল তালিকা</option>
          {folderOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </li>
  );
}
