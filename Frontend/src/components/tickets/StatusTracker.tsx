import type { Ticket } from "@/types/ticket.types";
import { cn } from "@/lib/utils";
import { displayStatus } from "./ticketDetail";

const STEPS = ["Submitted", "Assigned", "Being worked on", "Resolved", "Closed"] as const;

/** Which step the request is on; null when the tracker shouldn't show (cancelled) */
function currentStep(ticket: Ticket): number | null {
  switch (displayStatus(ticket)) {
    case "new":
    case "pending":
      return ticket.assignee_id ? 1 : 0;
    case "open":
    case "waiting":
      return 2;
    case "resolved":
      return 3;
    case "closed":
      return 4;
    default:
      return null;
  }
}

/** Five-step progress bar for the employee (briefing p.41): Submitted → Closed */
export default function StatusTracker({ ticket }: { ticket: Ticket }) {
  const current = currentStep(ticket);
  if (current === null) return null;

  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Request progress" className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {STEPS.map((label, index) => {
          const reached = index <= current;
          const isCurrent = index === current;
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
              <span aria-hidden className={cn("h-1.5 rounded-full", reached ? "bg-primary" : "bg-border")} />
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
        Step {current + 1} of {STEPS.length} · <span className="font-medium text-primary">{STEPS[current]}</span>
      </p>
    </div>
  );
}
