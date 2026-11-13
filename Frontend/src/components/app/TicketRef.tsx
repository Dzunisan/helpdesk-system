import { formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A ticket number, always written "HD-1048" in mono, small and muted (briefing p.31).
 * @example <TicketRef id={t.ticket_id} />
 * @example <TicketRef id={t.ticket_id} className="text-foreground" />
 */
export default function TicketRef({ id, className }: { id: number | string; className?: string }) {
  return <span className={cn("font-mono text-xs text-muted-foreground tabular-nums", className)}>{formatTicketRef(id)}</span>;
}
