import type { OutboxStatus } from "@/types/api";
import { OUTBOX_STATUS } from "./outboxStatus";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** SENT / FAILED / SIMULATED / QUEUED, written as the outbox stores it */
export default function OutboxStatusBadge({ status, className }: { status: OutboxStatus; className?: string }) {
  const s = OUTBOX_STATUS[status] ?? OUTBOX_STATUS.QUEUED;
  const Icon = s.icon;
  return (
    <Badge variant="outline" title={s.hint} className={cn("font-mono text-[11px] tracking-wide", s.className, className)}>
      <Icon aria-hidden />
      {status}
    </Badge>
  );
}
