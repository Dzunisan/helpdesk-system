import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import { CircleAlertIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { homePathFor } from "@/lib/roles";
import BrandMark from "@/components/app/BrandMark";
import PasswordInput from "@/components/app/PasswordInput";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { Status } from "@/lib/ticketVocabulary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Two sample tickets on the brand panel: a hint of what the product does */
const SAMPLE_TICKETS: { ref: string; title: string; note: string; kind: Status; offset?: boolean }[] = [
  {
    ref: "HD-1048",
    title: "VPN drops every 10 minutes",
    note: "Thabo Nkosi is working on this · update by 16:14",
    kind: "open",
  },
  {
    ref: "HD-1052",
    title: "Adobe Acrobat Pro licence",
    note: "Waiting for Thandi Mthembu's approval",
    kind: "pending",
    offset: true,
  },
];

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-primary text-primary-foreground md:flex md:flex-col md:justify-center md:gap-8 md:p-12">
      <div aria-hidden className="absolute -top-24 -right-24 size-80 rounded-full bg-primary-foreground/10" />
      <p className="relative max-w-md text-2xl leading-snug font-semibold">
        One place for every request. See who has it and when you&apos;ll hear back.
      </p>
      <div aria-hidden className="relative grid max-w-sm gap-4">
        {SAMPLE_TICKETS.map((t) => (
          <Card key={t.ref} size="sm" className={t.offset ? "ml-6 shadow-lg" : "shadow-lg"}>
            <CardContent className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{t.ref}</span>
                <StatusBadge kind={t.kind} />
              </div>
              <span className="text-sm font-semibold">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.note}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const SignInPage = () => {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Wait for the session check so a signed-in user never sees the form flash
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  // A session already exists: go straight to the role's home
  if (user) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    setSubmitting(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        { email, password },
        { withCredentials: true },
      );
      const signedIn = response.data.user;
      login(signedIn);
      navigate(homePathFor(signedIn.role), { replace: true });
    } catch {
      // One generic message for any failure: never reveal whether the account exists or is inactive
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-svh bg-background md:grid-cols-2">
      <main className="flex flex-col justify-center p-6 md:p-12">
        <div className="mx-auto grid w-full max-w-sm gap-8">
          <BrandMark />

          <div className="grid gap-1">
            <h1 className="text-xl font-semibold">Sign in to Helpdesk</h1>
            <p className="text-sm text-muted-foreground">Use your Mzansi Freight work email.</p>
          </div>

          <form onSubmit={handleSignIn}>
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
                  aria-invalid={failed || undefined}
                  required
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={failed || undefined}
                  required
                />
              </Field>

              {/* Visual only for now: the session length is set by the server */}
              <Field orientation="horizontal">
                <Checkbox id="keep-signed-in" defaultChecked />
                <FieldLabel htmlFor="keep-signed-in" className="font-normal">
                  Keep me signed in on this device
                </FieldLabel>
              </Field>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Spinner />}
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              {failed && (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                  <CircleAlertIcon />
                  <AlertDescription>
                    <p>
                      <span className="font-semibold">Email or password is incorrect.</span> Check both and
                      try again.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>

          <p className="text-xs text-muted-foreground">
            Trouble signing in? Call the IT desk on 011 555 0142.
          </p>
        </div>
      </main>

      <BrandPanel />
    </div>
  );
};

export default SignInPage;
