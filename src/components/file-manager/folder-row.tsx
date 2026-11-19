"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Folder, Pencil, Trash2 } from "lucide-react";
import { deleteFolder, renameFolder } from "@/app/dashboard/actions";

export function FolderRow({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await renameFolder(id, value);
      if (result.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!window.confirm(`"${name}" ফোল্ডারটি মুছবেন? / Delete this folder?`)) return;
    startTransition(async () => {
      const result = await deleteFolder(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-3">
        <Folder className="h-5 w-5 shrink-0" aria-hidden="true" />
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
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm"
          />
        ) : (
          <Link
            href={`/dashboard?folder=${id}`}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
          >
            {name}
          </Link>
        )}

        {editing ? (
          <>
            <button onClick={save} disabled={pending} className="text-sm underline">
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue(name);
                setError(null);
              }}
              className="text-sm text-muted-foreground underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              aria-label="Rename folder"
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={remove}
              disabled={pending}
              aria-label="Delete folder"
              className="p-1 text-muted-foreground hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </li>
  );
}
