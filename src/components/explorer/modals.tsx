"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  Folder,
  Home,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  getDocumentUrl,
  moveDocument,
  renameDocument,
  renameFolder,
} from "@/app/dashboard/actions";
import { Modal, ModalBody, ModalFooter, useAutoFocus } from "@/components/ui/modal";
import { btn, inputClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { formatBytes, makeStoragePath, validateUpload } from "@/lib/documents";
import { uploadFile } from "@/lib/upload";
import { FileIcon, fileKind } from "./file-icon";
import type { DocItem, NameTarget } from "./types";

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
}

// Starts a browser download of a private file via a short-lived link.
export async function startDownload(id: string): Promise<string | null> {
  const result = await getDocumentUrl(id, "download");
  if (!result.ok) return result.error;
  window.location.assign(result.url);
  return null;
}

/* ------------------------------------------------------------------ */
/* New folder                                                          */
/* ------------------------------------------------------------------ */

export function NewFolderModal({
  open,
  onClose,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  parentId: string | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      description="Group related documents together."
    >
      <NewFolderForm parentId={parentId} onClose={onClose} />
    </Modal>
  );
}

function NewFolderForm({
  parentId,
  onClose,
}: {
  parentId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const inputRef = useAutoFocus<HTMLInputElement>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFolder(parentId, name);
      if (result.ok) {
        toast(`Folder "${name.trim()}" created`);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <label className="block text-sm font-medium">
          Folder name
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Identity documents"
            maxLength={255}
            className={`${inputClass} mt-2`}
          />
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          Cancel
        </button>
        <button type="submit" disabled={pending || !name.trim()} className={btn("primary")}>
          {pending && <Spinner />}
          Create folder
        </button>
      </ModalFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Rename (folder or file)                                             */
/* ------------------------------------------------------------------ */

export function RenameModal({
  target,
  onClose,
}: {
  target: NameTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target?.kind === "folder" ? "Rename folder" : "Rename file"}
    >
      {target && <RenameForm key={target.id} target={target} onClose={onClose} />}
    </Modal>
  );
}

function RenameForm({ target, onClose }: { target: NameTarget; onClose: () => void }) {
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const inputRef = useAutoFocus<HTMLInputElement>(true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        target.kind === "folder"
          ? await renameFolder(target.id, name)
          : await renameDocument(target.id, name);
      if (result.ok) {
        toast("Renamed");
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <label className="block text-sm font-medium">
          Name
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            className={`${inputClass} mt-2`}
          />
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim() || name.trim() === target.name}
          className={btn("primary")}
        >
          {pending && <Spinner />}
          Save name
        </button>
      </ModalFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Move a file                                                         */
/* ------------------------------------------------------------------ */

export function MoveModal({
  doc,
  options,
  onClose,
}: {
  doc: DocItem | null;
  options: { id: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <Modal
      open={doc !== null}
      onClose={onClose}
      title="Move file"
      description={doc ? `Choose where "${doc.name}" should live.` : undefined}
    >
      {doc && <MoveForm key={doc.id} doc={doc} options={options} onClose={onClose} />}
    </Modal>
  );
}

function MoveForm({
  doc,
  options,
  onClose,
}: {
  doc: DocItem;
  options: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(doc.folder_id);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const destinations = [{ id: null as string | null, label: "All files (top level)" }, ...options];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await moveDocument(doc.id, choice);
      if (result.ok) {
        toast("File moved");
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <div role="radiogroup" aria-label="Destination" className="flex flex-col gap-1.5">
          {destinations.map((d) => {
            const selected = d.id === choice;
            return (
              <button
                key={d.id ?? "root"}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(d.id)}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-muted/50"
                }`}
              >
                {d.id === null ? (
                  <Home className="h-4 w-4 shrink-0 text-muted" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || choice === doc.folder_id}
          className={btn("primary")}
        >
          {pending && <Spinner />}
          Move here
        </button>
      </ModalFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Delete confirmation                                                 */
/* ------------------------------------------------------------------ */

export function DeleteModal({
  target,
  onClose,
}: {
  target: NameTarget | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target?.kind === "folder" ? "Delete folder?" : "Delete file?"}
    >
      {target && <DeleteForm key={target.id} target={target} onClose={onClose} />}
    </Modal>
  );
}

function DeleteForm({ target, onClose }: { target: NameTarget; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result =
        target.kind === "folder"
          ? await deleteFolder(target.id)
          : await deleteDocument(target.id);
      if (result.ok) {
        toast(`"${target.name}" deleted`);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <ModalBody>
        <div className="flex gap-4 rounded-2xl bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 text-sm">
            <p className="break-words font-medium text-ink">&ldquo;{target.name}&rdquo;</p>
            <p className="mt-1 text-muted">
              {target.kind === "folder"
                ? "Only empty folders can be deleted. This cannot be undone."
                : "The file will be permanently removed from your vault. This cannot be undone."}
            </p>
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          Keep it
        </button>
        <button type="button" onClick={confirm} disabled={pending} className={btn("danger")}>
          {pending && <Spinner />}
          Delete permanently
        </button>
      </ModalFooter>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

export function PreviewModal({
  doc,
  onClose,
}: {
  doc: DocItem | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={doc !== null}
      onClose={onClose}
      title={doc?.name ?? "Preview"}
      width="60rem"
    >
      {doc && <PreviewBody key={doc.id} doc={doc} onClose={onClose} />}
    </Modal>
  );
}

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const PREVIEWABLE = new Set(["image", "pdf", "text", "video", "audio"]);

function PreviewBody({ doc, onClose }: { doc: DocItem; onClose: () => void }) {
  const kind = fileKind(doc.name);
  const canPreview = PREVIEWABLE.has(kind);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [downloading, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!canPreview) return;
    let cancelled = false;
    getDocumentUrl(doc.id, "preview").then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", url: result.url }
          : { status: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id, canPreview]);

  function download() {
    startTransition(async () => {
      const error = await startDownload(doc.id);
      if (error) toast(error, "error");
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
        {(doc.summary || doc.error) && (
          <div className="mb-4 flex gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              {doc.summary && <p className="leading-relaxed">{doc.summary}</p>}
              {doc.error && <p className={doc.summary ? "mt-1 text-muted" : "text-muted"}>{doc.error}</p>}
            </div>
          </div>
        )}
        <div className="grid h-[60vh] place-items-center overflow-hidden rounded-2xl border border-line bg-surface">
          {!canPreview && (
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <FileIcon name={doc.name} size="lg" />
              <p className="max-w-xs text-sm text-muted">
                A preview isn&apos;t available for this file type. Download it to open it on
                your device.
              </p>
            </div>
          )}
          {canPreview && state.status === "loading" && (
            <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading preview" />
          )}
          {canPreview && state.status === "error" && (
            <p className="px-6 text-center text-sm text-danger">{state.message}</p>
          )}
          {canPreview && state.status === "ready" && kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={state.url} alt={doc.name} className="max-h-full max-w-full object-contain" />
          )}
          {canPreview && state.status === "ready" && kind === "video" && (
            <video src={state.url} controls className="max-h-full max-w-full" />
          )}
          {canPreview && state.status === "ready" && kind === "audio" && (
            <audio src={state.url} controls className="w-[90%]" />
          )}
          {canPreview && state.status === "ready" && (kind === "pdf" || kind === "text") && (
            <iframe
              src={state.url}
              title={doc.name}
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
      <ModalFooter>
        <span className="mr-auto hidden text-xs text-muted sm:block">
          {formatBytes(doc.size_bytes)}
          {doc.page_count ? ` · ${doc.page_count} ${doc.page_count === 1 ? "page" : "pages"}` : ""} · added{" "}
          {doc.dateLabel}
        </span>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          Close
        </button>
        <button type="button" onClick={download} disabled={downloading} className={btn("primary")}>
          {downloading ? <Spinner /> : <Download className="h-4 w-4" />}
          Download
        </button>
      </ModalFooter>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

export function UploadModal({
  open,
  onClose,
  onUploaded,
  folderId,
  folderName,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (documentIds: string[]) => void;
  folderId: string | null;
  folderName: string | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload files"
      description={`They will be added to ${folderName ? `"${folderName}"` : "your main library"}.`}
      width="34rem"
    >
      <UploadForm folderId={folderId} onClose={onClose} onUploaded={onUploaded} />
    </Modal>
  );
}

type UploadItem = {
  key: string;
  file: File;
  state: "ready" | "uploading" | "done" | "error";
  progress: number;
  message?: string;
};

function UploadForm({
  folderId,
  onClose,
  onUploaded,
}: {
  folderId: string | null;
  onClose: () => void;
  onUploaded: (documentIds: string[]) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  const readyCount = items.filter((i) => i.state === "ready").length;

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file): UploadItem => {
        const problem = validateUpload(file);
        return {
          key: crypto.randomUUID(),
          file,
          progress: 0,
          state: problem ? "error" : "ready",
          message: problem ?? undefined,
        };
      }),
    ]);
  }

  function patch(key: string, change: Partial<UploadItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function startUpload() {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("Your session has ended. Please sign in again.", "error");
      setBusy(false);
      return;
    }

    const detail = (message: string) =>
      process.env.NODE_ENV !== "production" ? ` (${message})` : "";

    const uploadedIds: string[] = [];
    let failed = 0;

    for (const item of items.filter((i) => i.state === "ready")) {
      patch(item.key, { state: "uploading", progress: 0 });
      const path = makeStoragePath(user.id, crypto.randomUUID(), item.file.name);

      // The file goes straight from the browser to private storage.
      // Storage rules only allow writing inside "<your user id>/".
      const result = await uploadFile({
        supabase,
        file: item.file,
        path,
        onProgress: (progress) => patch(item.key, { progress }),
      });
      if (!result.ok) {
        patch(item.key, { state: "error", message: result.error });
        failed++;
        continue;
      }

      const { data: row, error: insertError } = await supabase
        .from("documents")
        .insert({
          name: item.file.name.slice(0, 255),
          storage_path: path,
          mime_type: item.file.type || null,
          size_bytes: item.file.size,
          folder_id: folderId,
        })
        .select("id")
        .single();
      if (insertError || !row) {
        // Do not leave an orphan file behind.
        await supabase.storage.from("documents").remove([path]);
        patch(item.key, {
          state: "error",
          message: `Could not save the file record.${detail(insertError?.message ?? "")}`,
        });
        failed++;
        continue;
      }

      patch(item.key, { state: "done", progress: 1 });
      uploadedIds.push(row.id as string);
    }

    setBusy(false);
    router.refresh();
    if (uploadedIds.length > 0) {
      onUploaded(uploadedIds);
      toast(
        `${uploadedIds.length} file${uploadedIds.length === 1 ? "" : "s"} uploaded. The AI is reading ${uploadedIds.length === 1 ? "it" : "them"} now.`,
      );
    }
    if (failed === 0) onClose();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModalBody>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragging
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface hover:border-muted/60"
            }`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <CloudUpload className="h-6 w-6" />
            </span>
            <span className="font-medium">Drop files here, or click to browse</span>
            <span className="text-xs text-muted">
              Any file type. Large files upload in resumable pieces. The AI reads PDF, images,
              DOCX and text files.
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <FileIcon name={item.file.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p
                    className={`text-xs ${item.state === "error" ? "break-words text-danger" : "truncate text-muted"}`}
                  >
                    {item.state === "error"
                      ? item.message
                      : item.state === "done"
                        ? "Uploaded"
                        : item.state === "uploading"
                          ? `Uploading… ${Math.round(item.progress * 100)}% of ${formatBytes(item.file.size)}`
                          : formatBytes(item.file.size)}
                  </p>
                  {item.state === "uploading" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.max(2, item.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                {item.state === "uploading" && <Spinner />}
                {item.state === "done" && <CheckCircle2 className="h-5 w-5 text-ok" />}
                {(item.state === "ready" || item.state === "error") && !busy && (
                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    aria-label={`Remove ${item.file.name}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn("ghost")}>
          {items.some((i) => i.state === "done") ? "Close" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={startUpload}
          disabled={busy || readyCount === 0}
          className={btn("primary")}
        >
          {busy ? <Spinner /> : <CloudUpload className="h-4 w-4" />}
          {busy ? "Uploading…" : readyCount > 0 ? `Upload ${readyCount} file${readyCount === 1 ? "" : "s"}` : "Upload"}
        </button>
      </ModalFooter>
    </div>
  );
}
