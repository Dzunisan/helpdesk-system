import { useState, type FormEvent } from "react";
import axios from "axios";
import { CircleAlertIcon, MailIcon } from "lucide-react";
import AuthCard, { BackToSignIn } from "@/components/app/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    setLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/forgot-password`,
        { email },
        { withCredentials: true },
      );
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Calm confirmation that never says whether the account exists (briefing p.36)
  if (sent) {
    return (
      <AuthCard>
        <div className="grid justify-items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <MailIcon className="size-5" />
          </span>
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>, we&apos;ve
            sent a link to reset your password. It expires in 30 minutes.
          </p>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
          Nothing after 5 minutes? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            try again
          </button>
          .
        </p>
        <BackToSignIn />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your work email and we&apos;ll send you a link to choose a new one.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="name@mzansifreight.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          {failed && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
              <CircleAlertIcon />
              <AlertDescription>We couldn&apos;t send the link just now. Try again in a minute.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner />}
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </FieldGroup>
      </form>

      <BackToSignIn />
    </AuthCard>
  );
};

export default ForgotPasswordPage;
