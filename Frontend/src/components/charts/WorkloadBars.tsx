import { Link } from "react-router-dom";
import type { WorkloadRow } from "@/types/api";
import UserAvatar from "@/components/app/UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** A bar this long holds this many tickets (or the busiest person's load, if more) */
const MIN_SCALE = 8;

/** Open = brand indigo, Waiting on employee = amber (validated pair: CVD ΔE 34) */
const SEGMENTS = [
  { key: "open", label: "Open", className: "bg-primary" },
  { key: "waiting", label: "Waiting on employee", className: "bg-warning-solid" },
] as const;

/** The legend for the card header */
export function WorkloadLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {SEGMENTS.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-xs", s.className)} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

interface WorkloadBarsProps {
  agents: WorkloadRow[];
  /** Where a row goes, e.g. All tickets filtered to that agent */
  rowLink?: (agent: WorkloadRow) => string;
}

/**
 * Agent workload as stacked bars (briefing p.17, p.54): Open then Waiting on employee, the total,
 * and a rose breach count. Bars share one scale so lengths compare across people.
 */
export default function WorkloadBars({ agents, rowLink }: WorkloadBarsProps) {
  const scale = Math.max(MIN_SCALE, ...agents.map((a) => a.open + a.waiting));

  return (
    <ul role="list" className="-mx-2 flex flex-col gap-1">
      {agents.map((a) => {
        const total = a.open + a.waiting;
        const summary = `${a.name}: ${a.open} open, ${a.waiting} waiting on employee${a.breached ? `, ${a.breached} breached` : ""}`;
        const body = (
          <>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <UserAvatar name={a.name} size="sm" showName className="min-w-0" />
              <span className="flex shrink-0 items-baseline gap-2 text-sm tabular-nums">
                {a.breached > 0 && <span className="text-xs font-medium text-destructive">{a.breached} breached</span>}
                <span className="font-medium text-foreground">{total}</span>
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-2 min-w-0 gap-0.5 overflow-hidden rounded-full bg-muted">
                  {SEGMENTS.map((s) =>
                    a[s.key] > 0 ? (
                      <span
                        key={s.key}
                        className={cn("h-full first:rounded-l-full last:rounded-r-full", s.className)}
                        style={{ width: `${(a[s.key] / scale) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="tabular-nums">
                {a.open} open · {a.waiting} waiting on employee
              </TooltipContent>
            </Tooltip>
          </>
        );
        const grid = "flex flex-col gap-2.5 rounded-lg px-2 py-2.5";
        return (
          <li key={a.user_id}>
            {rowLink ? (
              <Link
                to={rowLink(a)}
                aria-label={summary}
                className={cn(grid, "transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring")}
              >
                {body}
              </Link>
            ) : (
              <div className={grid} aria-label={summary}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
