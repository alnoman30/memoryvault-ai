import { Suspense } from "react";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { FileManager } from "@/components/file-manager/file-manager";
import { createClient } from "@/lib/supabase/server";

async function Welcome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Second line of defense: the proxy already blocks logged-out visitors.
  if (!user) {
    redirect("/login");
  }

  return <p className="text-sm text-muted-foreground">{user.email}</p>;
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-3xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">MemoryVault AI</h1>
            <Suspense fallback={<p className="text-sm text-muted-foreground">...</p>}>
              <Welcome />
            </Suspense>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border px-3 py-2 text-sm font-medium"
            >
              Log out / লগআউট
            </button>
          </form>
        </header>

        <Suspense
          fallback={<p className="mt-8 text-sm text-muted-foreground">Loading...</p>}
        >
          <FileManager searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
