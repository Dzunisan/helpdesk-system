import { KeyRound } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * First sign-in: choose your own password (briefing p.10 S1, flow step 2): /change-password.
 * Shown while the signed-in user's must_change_password is true.
 * Data: services/users.ts changePassword({ current_password, new_password }).
 */
export default function ChangePasswordFirstLogin() {
  return (
    <BeingBuilt
      title="Choose your password"
      description="You signed in with a temporary password"
      plan="Replace the temporary password from your welcome email with one only you know."
      feature="S1"
      icon={KeyRound}
    />
  );
}
