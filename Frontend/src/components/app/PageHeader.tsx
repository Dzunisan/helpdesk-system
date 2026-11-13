import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Sentence case: "My requests", "Team & workload" */
  title: ReactNode;
  /** One muted line of context under the title */
  description?: ReactNode;
  /** Buttons on the right (at most one primary). They wrap under the title on phones. */
  actions?: ReactNode;
  /** A "‹ My requests" link above the title, for detail pages */
  back?: { to: string; label: string };
  /** Anything else above the title instead of `back`, e.g. a shadcn Breadcrumb or "HD-1048 · Open" */
  eyebrow?: ReactNode;
  /** Content between the title and the description, e.g. badges next to a ticket title */
  titleAside?: ReactNode;
  className?: string;
}

/**
 * Title + one-line context at the top of every page (briefing p.32). The page root is
 * `flex flex-col gap-8` and this is its first child.
 * @example <PageHeader title="Unassigned" description="12 tickets in IT Support" actions={<Button>Claim next</Button>} />
 * @example <PageHeader back={{ to: "/employee/my-requests", label: "My requests" }} title={ticket.title} />
 */
export default function PageHeader({ title, description, actions, back, eyebrow, titleAside, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link
            to={back.to}
            className="-ml-1 mb-2 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">{title}</h1>
          {titleAside}
        </div>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
