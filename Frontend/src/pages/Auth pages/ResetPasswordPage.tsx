import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { CircleAlertIcon, LinkIcon } from "lucide-react";
import AuthCard, { BackToSignIn } from "@/components/app/AuthCard";
import PasswordChecklist from "@/components/app/PasswordChecklist";
import PasswordInput from "@/components/app/PasswordInput";
import { passwordAcceptable } from "@/lib/passwordRules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type LinkState = "checking" | "valid" | "expired";

const API = import.meta.env.VITE_API_URL;
const EXPIRED_MESSAGE = "Invalid or expired reset token.";

function ExpiredLink() {
  return (
    <AuthCard>
      <div className="grid justify-items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <LinkIcon className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">This link has expired</h1>
        <p className="text-sm text-muted-foreground">
          Reset links work once and last 30 minutes. Request a new one and we&apos;ll email it to you.
        </p>
      </div>
      <Button asChild className="w-full">
        <Link to="/forgot-password">Request a new link</Link>
      </Button>
      <BackToSignIn />
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

  if (linkState === "checking") {
    return (
      <AuthCard>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner />
          Checking your link…
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        {email && <p className="text-sm text-muted-foreground">For {email}</p>}
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          <PasswordChecklist password={password} confirm={confirmPassword} />

          {error && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading && <Spinner />}
            {loading ? "Saving…" : "Set password"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;
