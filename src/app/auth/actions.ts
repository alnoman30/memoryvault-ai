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
    return { error: "ইমেইল ও পাসওয়ার্ড দিন। / Enter email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "ইমেইল বা পাসওয়ার্ড ঠিক নয়। / Wrong email or password." };
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
    return { error: "ইমেইল ও পাসওয়ার্ড দিন। / Enter email and password." };
  }
  if (password.length < 8) {
    return {
      error: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে। / Password must be at least 8 characters.",
    };
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

  // If email confirmation is off, the user is already logged in.
  if (data.session) {
    redirect("/dashboard");
  }

  return {
    message:
      "আপনার ইমেইলে একটি confirmation link পাঠানো হয়েছে। ওটায় click করুন। / We sent a confirmation link to your email.",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
