import { Suspense } from "react";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
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

  return (
    <p className="mt-2 text-muted-foreground">
      স্বাগতম! আপনি লগইন করেছেন: {user.email}
    </p>
  );
}

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-semibold">Dashboard</h1>

        <Suspense fallback={<p className="mt-2 text-muted-foreground">...</p>}>
          <Welcome />
        </Suspense>

        <div className="mt-8 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          File manager and AI chat are coming in the next phases.
        </div>

        <form action={logout} className="mt-8">
          <button
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Log out / লগআউট
          </button>
        </form>
      </div>
    </main>
  );
}
