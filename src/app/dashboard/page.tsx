import { Suspense } from "react";
import { ShellSkeleton } from "@/components/app/app-shell";
import { Workspace } from "@/components/app/workspace";

export const metadata = { title: "Your vault · MemoryVault" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Workspace searchParams={searchParams} />
    </Suspense>
  );
}
