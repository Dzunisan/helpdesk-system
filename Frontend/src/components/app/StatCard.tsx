import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Tones carry meaning only (briefing p.31): `warning` for "due soon / needs attention",
 * `danger` for "breached / broken". Amber has no theme token, so it lives here and in
 * SlaChip only; pages never colour a tile themselves.
 */
const TONE = {
  default: { card: "", label: "text-muted-foreground", value: "text-foreground", hint: "text-muted-foreground" },
  warning: {
    card: "border-amber-200 bg-amber-50/60",
    label: "text-amber-800",
    value: "text-amber-900",
    hint: "text-amber-800/80",
  },
  danger: {
    card: "border-destructive/25 bg-destructive/5",
    label: "text-destructive",
    value: "text-destructive",
    hint: "text-destructive/80",
  },
} as const;

interface StatCardProps {
  /** Short label: "My open", "Breached" */
  label: string;
  /** The number (or short value, "42m", "94%") */
  value: ReactNode;
  /** One muted line of context: "2 due today", "oldest 3h 10m" */
  hint?: ReactNode;
  /** `warning` (amber) or `danger` (rose); only when the number needs attention */
  tone?: keyof typeof TONE;
  /** Small icon at the top right */
  icon?: LucideIcon;
  /** Makes the tile a link to the list behind the number */
  to?: string;
  /** Shows skeletons for value and hint */
  loading?: boolean;
  className?: string;
}

/**
 * KPI tile: label, big tabular number, one line of context (briefing p.46, p.54, p.60, p.66).
 * Lay several out with `grid grid-cols-2 gap-4 xl:grid-cols-4` (two per row on phones).
 * @example <StatCard label="Breached" value={2} hint="HD-1045 · Sage login" tone="danger" to="/agent/assigned-tickets" />
 */
export default function StatCard({ label, value, hint, tone = "default", icon: Icon, to, loading, className }: StatCardProps) {
  const t = TONE[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-sm font-medium", t.label)}>{label}</span>
        {Icon && <Icon aria-hidden className={cn("size-4 shrink-0", t.label)} />}
      </div>
      {loading ? (
        <div className="flex flex-col gap-2 pt-0.5">
          <Skeleton className="h-8 w-16 bg-foreground/[0.07]" />
          <Skeleton className="h-3.5 w-24 bg-foreground/[0.07]" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className={cn("text-3xl leading-9 font-semibold tracking-tight tabular-nums", t.value)}>{value}</span>
          {hint && <span className={cn("truncate text-xs tabular-nums", t.hint)}>{hint}</span>}
        </div>
      )}
    </>
  );

  const cardClass = cn("gap-3 border border-border p-5 shadow-none ring-0 sm:p-6", t.card, className);

  if (to && !loading) {
    return (
      <Link
        to={to}
        className={cn(
          "flex flex-col rounded-xl bg-card text-sm text-card-foreground transition-colors outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
          cardClass,
        )}
      >
        {body}
      </Link>
    );
  }
  return <Card className={cardClass}>{body}</Card>;
}
