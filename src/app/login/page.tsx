import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Sign in · MemoryVault" };

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
