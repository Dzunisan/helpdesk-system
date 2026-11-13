import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon } from "lucide-react";
import BrandMark from "@/components/app/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Centred card with the logo above it: forgot and reset password (briefing p.36) */
export default function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <BrandMark />
      <Card className="w-full max-w-sm">
        <CardContent className="grid gap-5">{children}</CardContent>
      </Card>
    </main>
  );
}

export function BackToSignIn() {
  return (
    <Button asChild variant="link" className="justify-self-center">
      <Link to="/">
        <ChevronLeftIcon />
        Back to sign in
      </Link>
    </Button>
  );
}
