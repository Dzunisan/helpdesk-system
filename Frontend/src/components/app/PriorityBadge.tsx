import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  PRIORITY_RANK,
  toPriority,
  type Priority,
} from "@/lib/ticketVocabulary";

/** Priority colours (briefing p.31): rose Urgent, orange High, sky Normal, grey Low */
const STYLE: Record<Priority, string> = {
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-white text-zinc-500 border-zinc-200",
};

const BAR_HEIGHTS = [4, 7, 10, 13];

/** Four signal bars; the first N are filled for a priority of rank N */
function PriorityBars({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 16 14" aria-hidden className="fill-current">
      {BAR_HEIGHTS.map((h, i) => (
        <rect
          key={h}
          x={i * 4}
          y={14 - h}
          width={2.5}
          height={h}
          rx={0.75}
          className={i < level ? undefined : "opacity-25"}
        />
      ))}
    </svg>
  );
}

interface PriorityBadgeProps {
  /** The ticket's priority as stored ("Medium" displays as Normal) */
  priority: string | null | undefined;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const key = toPriority(priority);
  return (
    <Badge variant="outline" className={cn(STYLE[key], className)}>
      <PriorityBars level={PRIORITY_RANK[key]} />
      {PRIORITY_LABEL[key]}
    </Badge>
  );
}

export default PriorityBadge;
