import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LOAD_AMBER, LOAD_ROSE } from "./reportFormat";

/** A full bar: this many tickets in hand */
const FULL = 12;

/**
 * Work in hand (open + waiting) as a bar with the number beside it (briefing p.57):
 * indigo, amber at 8+, rose at 10+.
 */
export default function LoadBar({ load, className }: { load: number; className?: string }) {
  const tone =
    load >= LOAD_ROSE
      ? "[&>[data-slot=progress-indicator]]:bg-destructive"
      : load >= LOAD_AMBER
        ? "[&>[data-slot=progress-indicator]]:bg-warning-solid"
        : "";
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Progress value={Math.min(load / FULL, 1) * 100} aria-label={`Load: ${load} tickets in hand`} className={cn("h-1.5 flex-1", tone)} />
      <span
        className={cn(
          "w-5 shrink-0 text-right text-xs tabular-nums",
          load >= LOAD_ROSE ? "font-medium text-destructive" : load >= LOAD_AMBER ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        {load}
      </span>
    </div>
  );
}
