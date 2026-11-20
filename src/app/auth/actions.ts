"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Wrong email or password, or the email is not confirmed yet." };
  }

  redirect("/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and a password." };
  }
  if (password.length < 8) {
    return { error: "Your password must be at least 8 characters." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ?? `https://${h.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { display_name: name },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is off, the user is already signed in.
  if (data.session) {
    redirect("/dashboard");
  }

  return {
    message:
      "Check your inbox. We sent a confirmation link to your email. Open it to finish creating your account.",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
