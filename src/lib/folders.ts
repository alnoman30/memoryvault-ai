export type FolderNode = {
  id: string;
  name: string;
  parent_id: string | null;
};

// Path from the top folder down to `currentId`. Empty list means "root".
export function buildBreadcrumbs(
  folders: FolderNode[],
  currentId: string | null,
): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: FolderNode[] = [];
  let cursor = currentId ? byId.get(currentId) : undefined;
  let guard = folders.length; // protects against accidental loops

  while (cursor && guard-- > 0) {
    trail.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return trail;
}

// Flat list like "Work / Bills" used by the "move to folder" dropdown.
export function folderOptions(
  folders: FolderNode[],
): { id: string; label: string }[] {
  return folders
    .map((f) => ({
      id: f.id,
      label: buildBreadcrumbs(folders, f.id)
        .map((n) => n.name)
        .join(" / "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
