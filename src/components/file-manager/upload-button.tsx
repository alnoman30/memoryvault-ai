"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { makeStoragePath, validateUpload } from "@/lib/documents";

export function UploadButton({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setMessages([]);

    const problems: string[] = [];
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessages(["আবার লগইন করুন। / Please log in again."]);
      setBusy(false);
      return;
    }

    for (const file of files) {
      const invalid = validateUpload(file);
      if (invalid) {
        problems.push(invalid);
        continue;
      }

      const path = makeStoragePath(user.id, crypto.randomUUID(), file.name);

      // The file goes straight from the browser to private storage.
      // Storage rules only allow writing inside "<your user id>/".
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadError) {
        problems.push(
          `"${file.name}": আপলোড হয়নি। / Upload failed. (${uploadError.message})`,
        );
        continue;
      }

      const { error: insertError } = await supabase.from("documents").insert({
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        folder_id: folderId,
        is_sensitive: sensitive,
      });

      if (insertError) {
        // Do not leave an orphan file behind.
        await supabase.storage.from("documents").remove([path]);
        problems.push(
          `"${file.name}": সংরক্ষণ করা যায়নি। / Could not save. (${insertError.message})`,
        );
      }
    }

    setMessages(problems);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {busy ? "Uploading... / আপলোড হচ্ছে..." : "Upload / আপলোড"}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sensitive}
            onChange={(e) => setSensitive(e.target.checked)}
          />
          Sensitive (NID, passport...) / সংবেদনশীল
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />

      {messages.map((m) => (
        <p key={m} role="alert" className="text-sm text-red-500">
          {m}
        </p>
      ))}
    </div>
  );
}
