import { useEffect, useState } from "react";
import { CheckIcon, ClockIcon, PauseIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatSast } from "@/lib/format";

/**
 * SLA clock chip (briefing p.12 S3, p.31):
 *   "Due 16:14"      grey   plenty of time
 *   "Due in 1h 54m"  amber  under 25% of the target left
 *   "Breached 25m"   rose   past due
 *   "Met 48m"        green  target achieved (time taken from `start`)
 *   "Paused"         grey   waiting on employee (stretch: S11)
 */

type SlaState = "due" | "soon" | "breached" | "met" | "paused";

const STYLE: Record<SlaState, string> = {
  due: "bg-white text-zinc-700 border-zinc-200",
  soon: "bg-amber-50 text-amber-700 border-amber-200",
  breached: "bg-rose-50 text-rose-700 border-rose-200",
  met: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-zinc-50 text-zinc-500 border-zinc-200",
};

const MINUTE = 60_000;
/** Without a start time the target length is unknown, so "due soon" means under an hour left */
const DEFAULT_SOON_MS = 60 * MINUTE;

type Timestamp = string | number | Date | null | undefined;

const toMs = (value: Timestamp): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** 25m, 1h 54m, 2d 3h */
const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** "16:14" today, otherwise "Sat, 14 Nov, 16:14" (SAST) */
const formatDue = (ms: number, now: number): string =>
  formatSast(ms, "day") === formatSast(now, "day") ? formatSast(ms, "time") : formatSast(ms);

/** Re-renders every 30 seconds so the countdown stays current */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface SlaChipProps {
  /** When the target is due (first_response_due_at or resolution_due_at) */
  due: Timestamp;
  /** When the target was met (first_response_at or resolved_at); empty while still running */
  met?: Timestamp;
  /** When the clock started (created_at); used for the 25% "due soon" rule and the "Met" time */
  start?: Timestamp;
  /** Clock stopped while waiting on the employee */
  paused?: boolean;
  className?: string;
}

export function SlaChip({ due, met, start, paused = false, className }: SlaChipProps) {
  const now = useNow();
  const dueMs = toMs(due);
  const metMs = toMs(met);
  const startMs = toMs(start);

  if (dueMs === null && !paused) return null;

  let state: SlaState;
  let label: string;

  if (metMs !== null && dueMs !== null) {
    if (metMs <= dueMs) {
      state = "met";
      label = startMs !== null ? `Met ${formatDuration(metMs - startMs)}` : "Met";
    } else {
      state = "breached";
      label = `Breached ${formatDuration(metMs - dueMs)}`;
    }
  } else if (paused || dueMs === null) {
    state = "paused";
    label = "Paused";
  } else if (now > dueMs) {
    state = "breached";
    label = `Breached ${formatDuration(now - dueMs)}`;
  } else {
    const left = dueMs - now;
    const soonWithin =
      startMs !== null && dueMs > startMs ? (dueMs - startMs) * 0.25 : DEFAULT_SOON_MS;
    if (left <= soonWithin) {
      state = "soon";
      label = `Due in ${formatDuration(left)}`;
    } else {
      state = "due";
      label = `Due ${formatDue(dueMs, now)}`;
    }
  }

  const Icon = state === "met" ? CheckIcon : state === "paused" ? PauseIcon : ClockIcon;

  return (
    <Badge variant="outline" className={cn("tabular-nums", STYLE[state], className)}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export default SlaChip;
