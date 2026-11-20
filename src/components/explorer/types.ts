import type { DocStatus } from "@/lib/documents";

export type DocItem = {
  id: string;
  name: string;
  size_bytes: number | null;
  status: DocStatus;
  error: string | null;
  summary: string | null;
  page_count: number | null;
  folder_id: string | null;
  dateLabel: string;
};

export type NameTarget = {
  kind: "folder" | "document";
  id: string;
  name: string;
};
