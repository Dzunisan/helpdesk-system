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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Two sample tickets on the brand panel: a hint of what the product does (briefing p.35) */
const SAMPLE_TICKETS: { ref: string; title: string; note: string; kind: Status }[] = [
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
  },
];

function BrandPanel() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-center lg:px-16 xl:px-24"
    >
      {/* Depth: a soft darkening towards the bottom and two quiet circles */}
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-foreground/30" />
      <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary-foreground/10" />
      <div className="absolute -bottom-40 -left-24 size-96 rounded-full border border-primary-foreground/10" />

      <div className="relative flex max-w-md flex-col gap-10">
        <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">
          One place for every request. See who has it and when you&apos;ll hear back.
        </p>

        <div className="flex flex-col gap-4">
          {SAMPLE_TICKETS.map((t, index) => (
            <div
              key={t.ref}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl px-5 py-4 text-foreground shadow-xl shadow-foreground/15",
                index === 0 ? "bg-background" : "ml-10 bg-background/90",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-muted-foreground">{t.ref}</span>
                <StatusBadge kind={t.kind} />
              </div>
              <span className="text-sm font-semibold">{t.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t.note}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
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
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">Checking your session…</span>
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
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <main className="flex flex-col px-6 pt-12 pb-10 sm:px-10 sm:pt-20 lg:justify-center lg:px-16 lg:py-12">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-10">
          <BrandMark />

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to Helpdesk</h1>
              <p className="text-sm text-muted-foreground">Use your Mzansi Freight work email.</p>
            </div>

            {/* 40px controls: comfortable tap targets on phones */}
            <form onSubmit={handleSignIn}>
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
                    aria-invalid={failed || undefined}
                    aria-describedby={failed ? "sign-in-error" : undefined}
                    required
                  />
                </Field>

                <Field>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Link
                      to="/forgot-password"
                      className="-my-1 rounded-sm py-1 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    groupClassName="h-10"
                    id="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={failed || undefined}
                    aria-describedby={failed ? "sign-in-error" : undefined}
                    required
                  />
                </Field>

                <Button type="submit" size="lg" className="mt-1 w-full disabled:opacity-100" disabled={submitting}>
                  {submitting && <Spinner data-icon="inline-start" />}
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>

                {failed && (
                  <Alert
                    id="sign-in-error"
                    role="alert"
                    variant="destructive"
                    className="border-destructive/25 bg-destructive/5"
                  >
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
          </div>

          <p className="text-xs text-muted-foreground">
            Trouble signing in? Call the IT desk on{" "}
            <span className="font-medium whitespace-nowrap text-foreground tabular-nums">011 555 0142</span>.
          </p>
        </div>
      </main>

      <BrandPanel />
    </div>
  );
};

export default SignInPage;
