"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  CloudUpload,
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { btn } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/documents";
import { FileIcon } from "./file-icon";
import {
  DeleteModal,
  MoveModal,
  NewFolderModal,
  PreviewModal,
  RenameModal,
  UploadModal,
  startDownload,
} from "./modals";
import type { DocItem, NameTarget } from "./types";

type Props = {
  currentId: string | null;
  currentName: string | null;
  breadcrumbs: { id: string; name: string }[];
  subfolders: { id: string; name: string }[];
  documents: DocItem[];
  folderOptions: { id: string; label: string }[];
};

export function Explorer({
  currentId,
  currentName,
  breadcrumbs,
  subfolders,
  documents,
  folderOptions,
}: Props) {
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<NameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NameTarget | null>(null);
  const [moveDoc, setMoveDoc] = useState<DocItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const toast = useToast();

  async function download(doc: DocItem) {
    const error = await startDownload(doc.id);
    if (error) toast(error, "error");
  }

  const isEmpty = subfolders.length === 0 && documents.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Breadcrumb */}
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
        <Link
          href="/dashboard"
          className={`rounded-lg px-2 py-1 transition hover:bg-line/50 ${
            currentId ? "text-muted hover:text-ink" : "font-medium text-ink"
          }`}
        >
          All files
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted/60" aria-hidden="true" />
            <Link
              href={`/dashboard?folder=${crumb.id}`}
              className={`rounded-lg px-2 py-1 transition hover:bg-line/50 ${
                i === breadcrumbs.length - 1 ? "font-medium text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>

      {/* Title + actions */}
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="break-words">{currentName ?? "Your vault"}</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            {subfolders.length} {subfolders.length === 1 ? "folder" : "folders"} ·{" "}
            {documents.length} {documents.length === 1 ? "file" : "files"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setNewFolderOpen(true)} className={btn("secondary")}>
            <FolderPlus className="h-4 w-4" />
            New folder
          </button>
          <button type="button" onClick={() => setUploadOpen(true)} className={btn("primary")}>
            <CloudUpload className="h-4 w-4" />
            Upload
          </button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/50 px-6 py-16 text-center">
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <rect x="14" y="22" width="68" height="56" rx="14" fill="var(--raised)" stroke="var(--line)" strokeWidth="2" />
            <circle cx="48" cy="50" r="15" stroke="var(--accent)" strokeWidth="3" />
            <circle cx="48" cy="50" r="4" fill="var(--accent)" />
            <path d="M48 31v6M48 63v6M29 50h6M61 50h6" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            <rect x="30" y="12" width="36" height="12" rx="6" fill="var(--accent-soft)" />
          </svg>
          <h2 className="mt-6 font-display text-2xl font-semibold">Nothing here yet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Upload your first document, or create a folder to start organising your vault.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setUploadOpen(true)} className={btn("primary")}>
              <CloudUpload className="h-4 w-4" />
              Upload files
            </button>
            <button type="button" onClick={() => setNewFolderOpen(true)} className={btn("secondary")}>
              <FolderPlus className="h-4 w-4" />
              New folder
            </button>
          </div>
        </div>
      )}

      {/* Folders */}
      {subfolders.length > 0 && (
        <section className="mt-8" aria-label="Folders">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted">Folders</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((f) => (
              <li
                key={f.id}
                className="group flex items-center gap-1 rounded-2xl border border-line bg-raised pr-2 transition hover:border-accent/50 hover:shadow-[var(--shadow)]"
              >
                <Link
                  href={`/dashboard?folder=${f.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3.5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <FolderOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                </Link>
                <Menu
                  label={`Actions for folder ${f.name}`}
                  items={[
                    { label: "Rename", icon: Pencil, onSelect: () => setRenameTarget({ kind: "folder", id: f.id, name: f.name }) },
                    { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleteTarget({ kind: "folder", id: f.id, name: f.name }) },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Files */}
      {documents.length > 0 && (
        <section className="mt-8" aria-label="Files">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted">Files</h2>
          <div className="rounded-2xl border border-line bg-raised">
            <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_6rem_8rem_2.25rem] items-center gap-4 border-b border-line px-4 py-2.5 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted sm:grid">
              <span />
              <span>Name</span>
              <span>Size</span>
              <span>Added</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.25rem] items-center gap-3 px-4 py-3 transition hover:bg-surface/70 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_8rem_2.25rem] sm:gap-4"
                >
                  <FileIcon name={doc.name} />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="block max-w-full truncate text-left font-medium hover:text-accent"
                    >
                      {doc.name}
                    </button>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted sm:hidden">
                      <span>{formatBytes(doc.size_bytes)}</span>
                      <span>{doc.dateLabel}</span>
                    </p>
                    {doc.is_sensitive && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.68rem] font-medium text-accent">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        Sensitive
                      </span>
                    )}
                  </div>
                  <span className="hidden text-sm text-muted sm:block">{formatBytes(doc.size_bytes)}</span>
                  <span className="hidden text-sm text-muted sm:block">{doc.dateLabel}</span>
                  <Menu
                    label={`Actions for ${doc.name}`}
                    items={[
                      { label: "Preview", icon: Eye, onSelect: () => setPreviewDoc(doc) },
                      { label: "Download", icon: Download, onSelect: () => download(doc) },
                      { label: "Rename", icon: Pencil, onSelect: () => setRenameTarget({ kind: "document", id: doc.id, name: doc.name }) },
                      { label: "Move to…", icon: FolderInput, onSelect: () => setMoveDoc(doc) },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleteTarget({ kind: "document", id: doc.id, name: doc.name }) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} parentId={currentId} />
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folderId={currentId}
        folderName={currentName}
      />
      <RenameModal target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeleteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <MoveModal doc={moveDoc} options={folderOptions} onClose={() => setMoveDoc(null)} />
      <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
