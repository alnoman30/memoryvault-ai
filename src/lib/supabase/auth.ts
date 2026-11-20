import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; email: string };

// Who is signed in? getClaims() checks the login token's signature locally
// (with the project's public signing key, cached), so unlike getUser() it
// usually needs no extra round trip to the Supabase Auth server.
export async function getAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}
