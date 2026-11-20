"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { login, signup, type AuthState } from "@/app/auth/actions";
import { btn, inputClass } from "@/components/ui/styles";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isSignup ? signup : login,
    undefined,
  );
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="w-full max-w-sm">
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        {isSignup ? "Create your vault" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isSignup
          ? "Free to start. Your documents stay private to you."
          : "Sign in to open your documents."}
      </p>

      <div className="mt-8 flex flex-col gap-5">
        {isSignup && (
          <label className="block text-sm font-medium">
            Name
            <input
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              className={`${inputClass} mt-2`}
            />
          </label>
        )}

        <label className="block text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={`${inputClass} mt-2`}
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <span className="relative mt-2 block">
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-line/50 hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state?.message && (
        <p
          role="status"
          className="mt-5 flex items-start gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className={`${btn("primary", "lg")} mt-7 w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSignup ? "Create account" : "Sign in"}
      </button>

      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-ink underline underline-offset-4">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to MemoryVault?{" "}
            <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
