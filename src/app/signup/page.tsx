import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Create account · MemoryVault" };

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
