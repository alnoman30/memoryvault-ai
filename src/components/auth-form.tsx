"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "@/app/auth/actions";

const inputClass =
  "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-foreground/30";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isSignup ? signup : login,
    undefined,
  );

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          {isSignup ? "Create account" : "Welcome back"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignup ? "নতুন অ্যাকাউন্ট খুলুন" : "আপনার অ্যাকাউন্টে ঢুকুন"}
        </p>
      </div>

      {isSignup && (
        <label className="block text-sm">
          Name / নাম
          <input name="name" type="text" autoComplete="name" className={inputClass} />
        </label>
      )}

      <label className="block text-sm">
        Email / ইমেইল
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        Password / পাসওয়ার্ড
        <input
          name="password"
          type="password"
          required
          minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          className={inputClass}
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="text-sm text-green-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {pending ? "..." : isSignup ? "Sign up / সাইন আপ" : "Log in / লগইন"}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="underline">
              Create account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
