import { useState, type FormEvent } from "react";
import axios from "axios";
import { CircleAlertIcon, MailCheckIcon } from "lucide-react";
import AuthCard, { BackToSignIn } from "@/components/app/AuthCard";
import { AuthBody, AuthHeading, AuthMessage } from "@/components/auth/AuthParts";
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
        <AuthBody>
          <AuthMessage icon={MailCheckIcon} title="Check your email">
            <p>If an account exists for</p>
            <p className="font-medium wrap-anywhere text-foreground">{email}</p>
            <p className="mt-2">We&apos;ve sent a link to reset your password. It expires in 30 minutes.</p>
          </AuthMessage>
          <p className="rounded-lg bg-muted px-4 py-3 text-center text-xs text-pretty text-muted-foreground">
            Nothing after 5 minutes? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              try again
            </button>
            .
          </p>
          <BackToSignIn />
        </AuthBody>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthBody>
        <AuthHeading
          title="Forgot your password?"
          description="Enter your work email and we'll send you a link to choose a new one."
        />

        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@mzansifreight.co.za"
                className="h-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>

            {failed && (
              <Alert role="alert" variant="destructive" className="border-destructive/25 bg-destructive/5">
                <CircleAlertIcon />
                <AlertDescription>We couldn&apos;t send the link just now. Try again in a minute.</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full disabled:opacity-100" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </FieldGroup>
        </form>

        <BackToSignIn />
      </AuthBody>
    </AuthCard>
  );
};

export default ForgotPasswordPage;
