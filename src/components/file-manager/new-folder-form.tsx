"use client";

import { useState, useTransition } from "react";
import { FolderPlus } from "lucide-react";
import { createFolder } from "@/app/dashboard/actions";

export function NewFolderForm({ parentId }: { parentId: string | null }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createFolder(parentId, name);
      if (result.ok) {
        setName("");
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New folder / নতুন ফোল্ডার"
          maxLength={255}
          className="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/30"
        />
        <button
          type="submit"
          disabled={pending || name.trim() === ""}
          className="flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          Create
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}
