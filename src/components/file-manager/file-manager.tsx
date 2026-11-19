import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/documents";
import { buildBreadcrumbs, folderOptions, type FolderNode } from "@/lib/folders";
import { DocumentRow, type DocumentItem } from "./document-row";
import { FolderRow } from "./folder-row";
import { NewFolderForm } from "./new-folder-form";
import { UploadButton } from "./upload-button";

type SearchParams = Promise<{ folder?: string | string[] }>;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Dhaka",
});

export async function FileManager({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // user data: render at request time, never ahead of time
  const { folder } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security means these queries only ever return this user's rows.
  const { data: folderData, error: folderError } = await supabase
    .from("folders")
    .select("id, name, parent_id")
    .order("name");
  const allFolders: FolderNode[] = folderData ?? [];

  // Unknown or someone else's folder id simply falls back to the main list.
  const requested = typeof folder === "string" && isUuid(folder) ? folder : null;
  const currentId =
    requested && allFolders.some((f) => f.id === requested) ? requested : null;

  const docQuery = supabase
    .from("documents")
    .select("id, name, size_bytes, is_sensitive, folder_id, created_at")
    .order("created_at", { ascending: false });
  const { data: docData, error: docError } = await (currentId
    ? docQuery.eq("folder_id", currentId)
    : docQuery.is("folder_id", null));

  // Never hide a database problem: show it so it can be fixed.
  const loadError = folderError ?? docError;
  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-xl border p-5 text-sm text-red-500">
        তথ্য আনা যায়নি। / Could not load your files: {loadError.message}
      </p>
    );
  }

  const documents: DocumentItem[] = (docData ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    size_bytes: d.size_bytes,
    is_sensitive: d.is_sensitive,
    folder_id: d.folder_id,
    dateLabel: dateFormat.format(new Date(d.created_at)),
  }));

  const subfolders = allFolders.filter((f) => f.parent_id === currentId);
  const breadcrumbs = buildBreadcrumbs(allFolders, currentId);
  const options = folderOptions(allFolders);

  return (
    <section className="mt-8 flex flex-col gap-6">
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
        <Link href="/dashboard" className="font-medium hover:underline">
          All files / সব ফাইল
        </Link>
        {breadcrumbs.map((b) => (
          <span key={b.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Link href={`/dashboard?folder=${b.id}`} className="hover:underline">
              {b.name}
            </Link>
          </span>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2">
        <UploadButton folderId={currentId} />
        <NewFolderForm parentId={currentId} />
      </div>

      {subfolders.length > 0 && (
        <ul className="flex flex-col gap-2">
          {subfolders.map((f) => (
            <FolderRow key={f.id} id={f.id} name={f.name} />
          ))}
        </ul>
      )}

      {documents.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <DocumentRow key={d.id} doc={d} folderOptions={options} />
          ))}
        </ul>
      ) : (
        subfolders.length === 0 && (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            এখানে এখনও কিছু নেই। ওপরের Upload বোতাম দিয়ে প্রথম ফাইল যোগ করুন। / Nothing here yet.
            Upload your first file.
          </p>
        )
      )}
    </section>
  );
}
