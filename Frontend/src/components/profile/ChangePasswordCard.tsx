import { useState, type FormEvent } from "react";
import { CircleAlertIcon } from "lucide-react";
import SectionCard from "@/components/app/SectionCard";
import PasswordChecklist from "@/components/app/PasswordChecklist";
import PasswordInput from "@/components/app/PasswordInput";
import { passwordAcceptable } from "@/lib/passwordRules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

interface ChangePasswordCardProps {
  /** The signed-in user's email, so password managers save against the right account */
  email: string;
  /** Saves the new password; resolves true on success */
  onSubmit: (newPassword: string) => Promise<boolean>;
  saving: boolean;
  /** Server error from the last attempt, shown above the button */
  error: string | null;
  className?: string;
}

/** New + confirm password with the shared rule checklist (briefing p.36, p.68) */
export default function ChangePasswordCard({ email, onSubmit, saving, error, className }: ChangePasswordCardProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const canSubmit = passwordAcceptable(password, confirm) && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (await onSubmit(password.trim())) {
      setPassword("");
      setConfirm("");
    }
  };

  return (
    <SectionCard
      title="Change password"
      description="Same rules as everywhere else in Helpdesk."
      className={className}
      contentClassName="@container flex"
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <FieldGroup className="gap-5">
          <div className="grid gap-5 @lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-new-password">New password</FieldLabel>
              <PasswordInput
                groupClassName="h-10"
                id="profile-new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-confirm-password">Confirm new password</FieldLabel>
              <PasswordInput
                groupClassName="h-10"
                id="profile-confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
                required
              />
            </Field>
          </div>

          <PasswordChecklist password={password} confirm={confirm} className="gap-1.5" />
        </FieldGroup>

        {error && (
          <Alert role="alert" variant="destructive" className="border-destructive/25 bg-destructive/5">
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-auto flex justify-end">
          <Button type="submit" disabled={!canSubmit} className={saving ? "w-full disabled:opacity-100 sm:w-auto" : "w-full sm:w-auto"}>
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
