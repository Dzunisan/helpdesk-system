import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, KeyRound, LogOut, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { changePassword } from "@/services/users";
import { toApiError } from "@/services/apiClient";
import { passwordAcceptable } from "@/lib/passwordRules";
import { homePathFor } from "@/lib/roles";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import PasswordChecklist from "@/components/app/PasswordChecklist";
import PasswordInput from "@/components/app/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

const STEPS = [
  { icon: MailCheck, text: "Your welcome email had a temporary password. Type it first, so we know it's you." },
  { icon: KeyRound, text: "Choose a password only you know, using the rules below the fields." },
  { icon: ShieldCheck, text: "Then Helpdesk opens as normal. Next time, sign in with your new password." },
];

/**
 * First sign-in: replace the temporary password (briefing p.10 S1, flow step 2): /change-password.
 * The app sends people here while must_change_password is true. POST /api/auth/change-password
 * clears it; the shared rules come from lib/passwordRules (same as reset and profile).
 */
export default function ChangePasswordFirstLogin() {
  const { user, updateAuthUser, logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const firstTime = user?.must_change_password !== false;
  const sameAsCurrent = password.length > 0 && password === current;
  const canSubmit = !!current && passwordAcceptable(password, confirm) && !sameAsCurrent && !saving;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setCurrentError(null);
    setFormError(null);
    try {
      await changePassword({ current_password: current, new_password: password });
      updateAuthUser({ must_change_password: false });
      toast.success("Password changed", { description: "Use it the next time you sign in." });
      navigate(homePathFor(user?.role ?? null), { replace: true });
    } catch (err) {
      const apiError = toApiError(err, "Couldn't change your password. Please try again.");
      // 400 with "current" in it = the temporary password was wrong; anything else is for the form
      if (apiError.status === 400 && /current|temporary|incorrect|wrong/i.test(apiError.message)) {
        setCurrentError(apiError.message);
      } else {
        setFormError(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Choose your password"
        description={
          firstTime
            ? `Welcome to Helpdesk${user?.name ? `, ${user.name}` : ""}. You signed in with a temporary password.`
            : "Replace your password with a new one."
        }
        actions={
          <Button variant="outline" onClick={signOut}>
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <SectionCard
          title="New password"
          description="Same rules as everywhere else in Helpdesk."
          contentClassName="@container"
        >
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <input type="email" name="username" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
            <FieldGroup className="gap-5">
              <Field data-invalid={!!currentError || undefined} className="@lg:max-w-[calc(50%-0.625rem)]">
                <FieldLabel htmlFor="current-password">{firstTime ? "Temporary password" : "Current password"}</FieldLabel>
                <PasswordInput
                  groupClassName="h-10"
                  id="current-password"
                  autoComplete="current-password"
                  value={current}
                  aria-invalid={!!currentError || undefined}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setCurrentError(null);
                  }}
                  disabled={saving}
                  autoFocus
                  required
                />
                {currentError ? (
                  <FieldError>{currentError}</FieldError>
                ) : (
                  firstTime && <FieldDescription className="text-xs">From your welcome email.</FieldDescription>
                )}
              </Field>

              <div className="grid gap-5 @lg:grid-cols-2">
                <Field data-invalid={sameAsCurrent || undefined}>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <PasswordInput
                    groupClassName="h-10"
                    id="new-password"
                    autoComplete="new-password"
                    value={password}
                    aria-invalid={sameAsCurrent || undefined}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={saving}
                    required
                  />
                  {sameAsCurrent && <FieldError>Choose a different password from the temporary one.</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                  <PasswordInput
                    groupClassName="h-10"
                    id="confirm-password"
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

            {formError && (
              <Alert role="alert" variant="destructive" className="border-destructive/25 bg-destructive/5">
                <CircleAlert />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!canSubmit}
                className={saving ? "w-full disabled:opacity-100 sm:w-auto" : "w-full sm:w-auto"}
              >
                {saving && <Spinner data-icon="inline-start" />}
                {saving ? "Saving…" : "Set password and continue"}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Why you're seeing this">
          <ol className="flex flex-col gap-4">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="text-pretty">{text}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
