import type { OutboxStatus } from "@/types/api";
import { OUTBOX_STATUS } from "./outboxStatus";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Sent / Failed / Simulated / Queued in sentence case (the outbox stores SENT, FAILED, ...) */
export default function OutboxStatusBadge({ status, className }: { status: OutboxStatus; className?: string }) {
  const s = OUTBOX_STATUS[status] ?? OUTBOX_STATUS.QUEUED;
  const Icon = s.icon;
  return (
    <Badge variant="outline" title={s.hint} className={cn(s.className, className)}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}
