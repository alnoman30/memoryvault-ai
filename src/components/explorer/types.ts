export type DocItem = {
  id: string;
  name: string;
  size_bytes: number | null;
  is_sensitive: boolean;
  status: "uploaded" | "processing" | "ready" | "failed";
  folder_id: string | null;
  dateLabel: string;
};

export type NameTarget = {
  kind: "folder" | "document";
  id: string;
  name: string;
};
