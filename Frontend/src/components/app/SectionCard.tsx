import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  /** Sentence case section title: "Departments", "My tickets, due soonest" */
  title?: ReactNode;
  /** One muted line under the title */
  description?: ReactNode;
  /** Top-right slot: a link ("View all →"), a small button or a count */
  action?: ReactNode;
  /** Muted footer bar, e.g. "Counts only. HR stays private." */
  footer?: ReactNode;
  /**
   * Content runs edge to edge (no side padding) under a divider: use for a list or
   * table inside the card (ListBody, ListHeaderRow, shadcn Table).
   */
  flush?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * A titled card with 24px padding (briefing p.32 "Cards are Card").
 * @example <SectionCard title="System health" description="Live checks"><KeyValueList items={...} /></SectionCard>
 * @example <SectionCard title="Departments" action={<Button variant="ghost" size="sm">View all</Button>} flush>
 *            <ListHeaderRow grid={G}>…</ListHeaderRow><ListBody>…</ListBody>
 *          </SectionCard>
 */
export default function SectionCard({
  title,
  description,
  action,
  footer,
  flush,
  className,
  contentClassName,
  children,
}: SectionCardProps) {
  const hasHeader = title || description || action;
  return (
    <Card
      className={cn(
        "gap-5 border border-border shadow-none ring-0 [--card-spacing:--spacing(6)]",
        flush && "gap-0 pb-0",
        footer && "pb-0",
        className,
      )}
    >
      {hasHeader && (
        <CardHeader className={cn("items-center", flush && "border-b border-border pb-4 [.border-b]:pb-4")}>
          {title && <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction className="self-center text-sm">{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn("flex-1", flush && "px-0", contentClassName)}>{children}</CardContent>
      {footer && (
        <CardFooter className={cn("border-border bg-muted/40 px-6 py-3 text-xs text-muted-foreground", !flush && "mt-1")}>
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
