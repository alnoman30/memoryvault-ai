import Link from "next/link";
import { FileText, FolderOpen, MessageCircle, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Upload documents",
    titleBn: "ডকুমেন্ট আপলোড",
    text: "PDF, image, DOCX, TXT",
  },
  {
    icon: FolderOpen,
    title: "Organize in folders",
    titleBn: "ফোল্ডারে সাজান",
    text: "Rename, move, preview, download",
  },
  {
    icon: MessageCircle,
    title: "Ask in Bangla or English",
    titleBn: "বাংলা বা ইংরেজিতে প্রশ্ন",
    text: "Answers come with citations",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    titleBn: "আপনার তথ্য শুধু আপনার",
    text: "Every account is fully isolated",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          MemoryVault AI
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Your documents, remembered.
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          আপনার ডকুমেন্ট, আপনার স্মৃতি। বছর পরেও খুঁজে পান এক প্রশ্নে।
        </p>
      </div>

      <ul className="mt-14 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, titleBn, text }) => (
          <li key={title} className="rounded-xl border bg-card p-5 text-left">
            <Icon className="h-5 w-5" aria-hidden="true" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{titleBn}</p>
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-foreground px-5 py-2 font-medium text-background"
        >
          Sign up / সাইন আপ
        </Link>
        <Link href="/login" className="rounded-lg border px-5 py-2 font-medium">
          Log in / লগইন
        </Link>
      </div>
    </main>
  );
}
