import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, toStatus, type Status } from "@/lib/ticketVocabulary";

/** One status map, used everywhere (briefing p.31, p.34 #2) */
const STYLE: Record<Status, string> = {
  new: "bg-zinc-100 text-zinc-700 border-zinc-200",
  open: "bg-indigo-50 text-indigo-700 border-indigo-200",
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-violet-50 text-violet-700 border-violet-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-zinc-800 text-white border-zinc-800",
  cancelled: "bg-white text-zinc-500 border-zinc-300",
};

interface StatusBadgeProps {
  /** The ticket's status as stored (legacy names are mapped in lib/ticketVocabulary) */
  status?: string | null;
  /** A display key, for samples that aren't database values (e.g. the sign-in panel) */
  kind?: Status;
  className?: string;
}

export function StatusBadge({ status, kind, className }: StatusBadgeProps) {
  const key = kind ?? toStatus(status);
  return (
    <Badge variant="outline" className={cn(STYLE[key], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[key]}
    </Badge>
  );
}

export default StatusBadge;
