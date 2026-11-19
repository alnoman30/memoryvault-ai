import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryVault AI",
  description:
    "Your private AI-powered document vault. Upload documents and ask questions in Bangla or English.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
