import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** A lucide icon, e.g. Inbox, SearchX, CircleCheck */
  icon: LucideIcon;
  /** Short and friendly: "Queue clear", "Nothing matches your search" */
  title: ReactNode;
  /** One sentence of what to do or what will appear here */
  description?: ReactNode;
  /** Optional button(s), e.g. "New request" or "Clear search" */
  action?: ReactNode;
  /**
   * `inset` (default): sits inside a ListCard/SectionCard, no border of its own.
   * `card`: stands alone with a dashed rounded border.
   */
  variant?: "inset" | "card";
  /** Vertical room: `default` for a page's main list, `compact` for a side card */
  size?: "default" | "compact";
  className?: string;
}

/**
 * The empty state for any data view (briefing p.32 "Feedback"): icon, title, one sentence, optional action.
 * @example <EmptyState icon={Inbox} title="Queue clear" description="Nothing unassigned in IT Support." />
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "inset",
  size = "default",
  className,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn(
        size === "compact" ? "py-10" : "py-16 sm:py-20",
        variant === "card" && "border border-dashed border-border bg-background",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 rounded-xl bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="flex-row flex-wrap justify-center gap-2">{action}</EmptyContent>}
    </Empty>
  );
}
