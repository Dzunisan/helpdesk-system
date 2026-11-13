import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, CircleAlert, CircleCheck, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItemProps {
  /** `todo` = needs fixing (amber), `done` = all good (green tick) */
  state: "todo" | "done";
  /** Overrides the default icon for a todo item */
  icon?: LucideIcon;
  children: ReactNode;
  /** The fix: "Appoint lead" → link */
  action?: { label: string; to: string };
}

/** One line of the System Admin set-up checklist (briefing p.60: Item with an icon, text and a fix link) */
export default function ChecklistItem({ state, icon, children, action }: ChecklistItemProps) {
  const Icon = state === "done" ? CircleCheck : (icon ?? CircleAlert);
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          state === "done" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <span className={cn("text-sm text-pretty", state === "done" ? "text-muted-foreground" : "text-foreground")}>
          {children}
        </span>
        {action && (
          <Link
            to={action.to}
            className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm text-sm font-medium whitespace-nowrap text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {action.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

/** "Can / can't" line for an account's scope (briefing p.66 "This account"): green tick or muted dash */
export function CapabilityItem({ can, children }: { can: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        className={cn(
          "-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          can ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
        )}
      >
        {can ? <Check className="size-3.5" aria-label="Can" /> : <Minus className="size-3.5" aria-label="Can't" />}
      </span>
      <span className={can ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}
