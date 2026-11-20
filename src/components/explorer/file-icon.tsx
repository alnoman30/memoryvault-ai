import { File, FileImage, FileText, FileType2 } from "lucide-react";
import { getExtension } from "@/lib/documents";

const IMAGE = ["png", "jpg", "jpeg", "webp"];

export function fileKind(name: string): "image" | "pdf" | "word" | "text" {
  const ext = getExtension(name);
  if (IMAGE.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "word";
  return "text";
}

const looks = {
  image: { Icon: FileImage, tint: "bg-ok-soft text-ok" },
  pdf: { Icon: FileText, tint: "bg-danger-soft text-danger" },
  word: { Icon: FileType2, tint: "bg-accent-soft text-accent" },
  text: { Icon: File, tint: "bg-line/50 text-muted" },
} as const;

// A coloured tile showing what kind of file this is.
export function FileIcon({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const { Icon, tint } = looks[fileKind(name)];
  const box = size === "lg" ? "h-16 w-16 rounded-2xl" : "h-10 w-10 rounded-xl";
  const icon = size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${tint}`}>
      <Icon className={icon} aria-hidden="true" />
    </span>
  );
}
