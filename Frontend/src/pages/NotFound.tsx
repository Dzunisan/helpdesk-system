import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/app/AppLayout";
import { homePathFor } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

function NotFoundMessage({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <p className="text-xs font-semibold tracking-wide text-primary">404</p>
        <EmptyTitle>We couldn&apos;t find that page</EmptyTitle>
        <EmptyDescription>The link may be old, or you may not have access to it.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to={homeHref}>{homeLabel}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * The "*" route (briefing p.69). Signed in: the 404 sits inside the user's own layout
 * with a way home. Signed out: a plain card that leads to sign-in.
 */
export default function NotFound() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loader flex min-h-screen items-center justify-center" />;
  }

  if (user) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <NotFoundMessage homeHref={homePathFor(user.role)} homeLabel="Go to my home" />
        </div>
      </AppLayout>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent>
          <NotFoundMessage homeHref="/" homeLabel="Go to sign in" />
        </CardContent>
      </Card>
    </div>
  );
}
