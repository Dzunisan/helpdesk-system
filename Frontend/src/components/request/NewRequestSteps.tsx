import { Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STEPS = ["What do you need?", "Details", "Done"] as const;

/**
 * "1 What do you need? — 2 Details — 3 Done" above the new request pages (briefing p.38-40).
 * @param current 0, 1 or 2
 */
export default function NewRequestSteps({ current, className }: { current: 0 | 1 | 2; className?: string }) {
  return (
    <ol aria-label="New request steps" className={cn("flex items-center gap-3", className)}>
      {STEPS.map((label, index) => {
        const done = index < current;
        const isCurrent = index === current;
        return (
          <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 items-center gap-3 last:shrink-0 not-last:flex-auto sm:not-last:flex-1">
            {/* The current step's label never truncates; the lines shrink instead */}
            <span className={cn("flex min-w-0 items-center gap-2", isCurrent && "shrink-0")}>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary ring-3 ring-primary/15",
                  !done && !isCurrent && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                  !isCurrent && "hidden sm:inline",
                )}
              >
                <span className="sr-only">{done ? "Done: " : isCurrent ? "Current step: " : "Next: "}</span>
                {label}
              </span>
            </span>
            {index < STEPS.length - 1 && <Separator className={cn("min-w-6 flex-1", done ? "bg-primary" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
