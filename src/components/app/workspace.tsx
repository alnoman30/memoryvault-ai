import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/documents";
import { buildBreadcrumbs, folderOptions, type FolderNode } from "@/lib/folders";
import { Explorer } from "@/components/explorer/explorer";
import type { DocItem } from "@/components/explorer/types";
import { AppShell } from "./app-shell";

type SearchParams = Promise<{ folder?: string | string[] }>;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Dhaka",
});

// Loads everything for the signed-in user and renders the page.
// Row Level Security means each query only ever returns this user's rows.
export async function Workspace({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // user data: render at request time, never ahead of time
  const { folder } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [foldersResult, sizesResult] = await Promise.all([
    supabase.from("folders").select("id, name, parent_id").order("name"),
    supabase.from("documents").select("id, size_bytes, status"),
  ]);

  const allFolders: FolderNode[] = foldersResult.data ?? [];
  const usedBytes = (sizesResult.data ?? []).reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);

  // An unknown or foreign folder id simply falls back to the top level.
  const requested = typeof folder === "string" && isUuid(folder) ? folder : null;
  const currentId =
    requested && allFolders.some((f) => f.id === requested) ? requested : null;

  const docQuery = supabase
    .from("documents")
    .select("id, name, size_bytes, status, error, summary, page_count, folder_id, created_at")
    .order("created_at", { ascending: false });
  const docsResult = await (currentId
    ? docQuery.eq("folder_id", currentId)
    : docQuery.is("folder_id", null));

  // Never hide a database problem: show it so it can be fixed.
  const loadError = foldersResult.error ?? sizesResult.error ?? docsResult.error;
  if (loadError) {
    return (
      <AppShell email={user.email ?? ""} usedBytes={0}>
        <p
          role="alert"
          className="mx-auto max-w-xl rounded-2xl border border-danger/40 bg-danger-soft p-5 text-sm text-danger"
        >
          Your files could not be loaded: {loadError.message}
        </p>
      </AppShell>
    );
  }

  const documents: DocItem[] = (docsResult.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    size_bytes: d.size_bytes,
    status: d.status as DocItem["status"],
    error: d.error,
    summary: d.summary,
    page_count: d.page_count,
    folder_id: d.folder_id,
    dateLabel: dateFormat.format(new Date(d.created_at)),
  }));

  const breadcrumbs = buildBreadcrumbs(allFolders, currentId);

  // Documents anywhere in the vault that still need reading by the AI.
  const pendingIds = (sizesResult.data ?? [])
    .filter((d) => d.status === "uploaded" || d.status === "processing")
    .map((d) => d.id);

  return (
    <AppShell email={user.email ?? ""} usedBytes={usedBytes}>
      <Explorer
        currentId={currentId}
        currentName={breadcrumbs.at(-1)?.name ?? null}
        breadcrumbs={breadcrumbs.map(({ id, name }) => ({ id, name }))}
        subfolders={allFolders
          .filter((f) => f.parent_id === currentId)
          .map(({ id, name }) => ({ id, name }))}
        documents={documents}
        folderOptions={folderOptions(allFolders)}
        pendingIds={pendingIds}
      />
    </AppShell>
  );
}
