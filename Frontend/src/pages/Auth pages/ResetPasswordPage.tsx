import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { CircleAlertIcon, LinkIcon } from "lucide-react";
import AuthCard, { BackToSignIn } from "@/components/app/AuthCard";
import PasswordChecklist from "@/components/app/PasswordChecklist";
import PasswordInput from "@/components/app/PasswordInput";
import { AuthBody, AuthHeading, AuthMessage } from "@/components/auth/AuthParts";
import { passwordAcceptable } from "@/lib/passwordRules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type LinkState = "checking" | "valid" | "expired";

const API = import.meta.env.VITE_API_URL;
const EXPIRED_MESSAGE = "Invalid or expired reset token.";

function ExpiredLink() {
  return (
    <AuthCard>
      <AuthBody>
        <AuthMessage icon={LinkIcon} title="This link has expired" tone="muted">
          <p>Reset links work once and last 30 minutes. Request a new one and we&apos;ll email it to you.</p>
        </AuthMessage>
        <Button asChild size="lg" className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
        <BackToSignIn />
      </AuthBody>
    </AuthCard>
  );
}

/** Placeholder shaped like the form while the link is checked */
function CheckingLink() {
  return (
    <AuthCard>
      <AuthBody aria-busy>
        <span className="sr-only">Checking your link…</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex flex-col gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3.5 w-40" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </AuthBody>
    </AuthCard>
  );
}

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [linkState, setLinkState] = useState<LinkState>(token ? "checking" : "expired");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check the link on load, so a missing or expired token is caught before any typing
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    axios
      .post(`${API}/api/auth/reset-password/verify`, { token })
      .then((res) => {
        if (cancelled) return;
        setEmail(res.data.email ?? "");
        setLinkState("valid");
      })
      .catch(() => {
        if (!cancelled) setLinkState("expired");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSubmit = passwordAcceptable(password, confirmPassword) && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setError("");
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/reset-password`, { token, newPassword: password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      if (message === EXPIRED_MESSAGE) {
        setLinkState("expired");
      } else {
        setError(message || "We couldn't update your password just now. Try again in a minute.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (linkState === "expired") return <ExpiredLink />;
  if (linkState === "checking") return <CheckingLink />;

  return (
    <AuthCard>
      <AuthBody>
        <AuthHeading
          title="Choose a new password"
          description={
            email ? (
              <>
                For <span className="wrap-anywhere">{email}</span>
              </>
            ) : undefined
          }
        />

        <form onSubmit={handleSubmit}>
          {/* Lets password managers save the new password against the right account */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <PasswordInput
                groupClassName="h-10"
                id="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
              <PasswordInput
                groupClassName="h-10"
                id="confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>

            <PasswordChecklist password={password} confirm={confirmPassword} className="gap-1.5" />

            {error && (
              <Alert role="alert" variant="destructive" className="border-destructive/25 bg-destructive/5">
                <CircleAlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className={loading ? "w-full disabled:opacity-100" : "w-full"} disabled={!canSubmit}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Saving…" : "Set password"}
            </Button>
          </FieldGroup>
        </form>

        <BackToSignIn />
      </AuthBody>
    </AuthCard>
  );
};

export default ResetPasswordPage;
