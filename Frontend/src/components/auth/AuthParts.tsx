import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inner body of an AuthCard: 24px of breathing room in total (the card adds 16px)
 * and a 24px rhythm between the heading, the form and the footer link.
 */
export function AuthBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-6 p-2", className)} {...props} />;
}

/** Title + one muted line at the top of an auth form */
export function AuthHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-lg font-semibold tracking-tight text-balance text-foreground">{title}</h1>
      {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
    </div>
  );
}

/**
 * Centred icon + title + sentence, for the calm "Check your email" and
 * "This link has expired" states (briefing p.36).
 */
export function AuthMessage({
  icon: Icon,
  title,
  children,
  tone = "primary",
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  /** primary = indigo tint (good news), muted = grey (nothing to do here) */
  tone?: "primary" | "muted";
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      {children && <div className="text-sm text-pretty text-muted-foreground">{children}</div>}
    </div>
  );
}
