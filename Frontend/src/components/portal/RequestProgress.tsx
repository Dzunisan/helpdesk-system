import type { Ticket } from "@/types/api";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PROGRESS_STEPS, progressStep } from "./portalText";

/**
 * The five-step progress bar on the request detail (briefing p.41):
 * Submitted -> Assigned -> Being worked on -> Resolved -> Closed. Hidden for cancelled requests.
 */
export default function RequestProgress({ ticket, className }: { ticket: Pick<Ticket, "ticket_status" | "assignee_id">; className?: string }) {
  const current = progressStep(ticket);
  if (current === null) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ol aria-label="Request progress" className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {PROGRESS_STEPS.map((label, index) => {
          const reached = index <= current;
          const isCurrent = index === current;
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
              <Progress
                value={reached ? 100 : 0}
                aria-hidden
                className={cn("h-1.5 bg-border", !reached && "*:data-[slot=progress-indicator]:opacity-0")}
              />
              <span
                className={cn(
                  "hidden truncate text-xs sm:block",
                  isCurrent ? "font-medium text-primary" : reached ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="sr-only">{reached ? (isCurrent ? "Current step: " : "Done: ") : "Next: "}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground sm:hidden">
        Step {current + 1} of {PROGRESS_STEPS.length} ·{" "}
        <span className="font-medium text-primary">{PROGRESS_STEPS[current]}</span>
      </p>
    </div>
  );
}
