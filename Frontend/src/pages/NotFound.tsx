import { Link, useLocation } from "react-router-dom";
import { HouseIcon, LogInIcon } from "lucide-react";
import { useAuth, type Role } from "@/context/AuthContext";
import AppLayout from "@/components/app/AppLayout";
import AuthCard from "@/components/app/AuthCard";
import { AuthBody } from "@/components/auth/AuthParts";
import NotFoundPanel, { ContactItButton } from "@/components/auth/NotFoundPanel";
import { homePathFor } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Where "home" is, named the way the user's own navigation names it */
const HOME_LABEL: Record<NonNullable<Role>, string> = {
  Employee: "Go to my requests",
  Agent: "Go to home",
  "Department Lead": "Go to dashboard",
  "System Admin": "Go to overview",
  "Platform Admin": "Go to overview",
};

const DESCRIPTION = "The link may be old, or you may not have access to it.";

/** The address that wasn't found, so people can check it for typos */
function RequestedPath({ path }: { path: string }) {
  return (
    <span className="mt-3 block">
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all text-foreground">{path}</code>
    </span>
  );
}

/**
 * The "*" route (briefing p.69). Signed in: the 404 sits inside the user's own layout
 * with a way home. Signed out: the public card that leads to sign-in.
 */
export default function NotFound() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (user) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-8">
          <section
            aria-labelledby="not-found-title"
            className="flex min-h-[min(32rem,calc(100svh-14rem))] items-center justify-center rounded-xl border border-border bg-background px-6 py-16"
          >
            <NotFoundPanel
              eyebrow="404"
              title={<span id="not-found-title">We couldn&apos;t find that page</span>}
              description={
                <>
                  {DESCRIPTION}
                  <RequestedPath path={pathname} />
                </>
              }
              actions={
                <>
                  <Button asChild>
                    <Link to={homePathFor(user.role)}>
                      <HouseIcon data-icon="inline-start" />
                      {user.role ? HOME_LABEL[user.role] : "Go to my home"}
                    </Link>
                  </Button>
                  <ContactItButton />
                </>
              }
            />
          </section>
        </div>
      </AppLayout>
    );
  }

  return (
    <AuthCard>
      <AuthBody className="py-6">
        <NotFoundPanel
          eyebrow="404"
          title="We couldn't find that page"
          description={
            <>
              {DESCRIPTION}
              <RequestedPath path={pathname} />
            </>
          }
        />
        <Button asChild size="lg" className="w-full">
          <Link to="/">
            <LogInIcon data-icon="inline-start" />
            Go to sign in
          </Link>
        </Button>
      </AuthBody>
    </AuthCard>
  );
}
