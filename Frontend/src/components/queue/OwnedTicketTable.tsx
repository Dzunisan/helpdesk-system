import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Ticket } from "@/types/ticket.types";
import { formatSast } from "@/lib/format";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import { ListBody, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import TicketSubject from "./TicketSubject";

/**
 * The table behind "My open" and "Resolved by me" (briefing p.53): one grid, whole row is a link.
 * Ref · Subject + requester · Status · Priority · Updated · ›   (stacks below xl)
 */
export const OWNED_GRID =
  "xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_9rem_6rem_9.5rem_1rem] xl:items-center xl:gap-5";

interface OwnedTicketTableProps {
  tickets: Ticket[];
  loading: boolean;
  /** Base path for the row links, e.g. "/agent" */
  basePath: string;
  /** Header for the date column ("Updated") */
  dateLabel: string;
  /** Rendered instead of rows when there are none */
  empty: ReactNode;
}

export default function OwnedTicketTable({ tickets, loading, basePath, dateLabel, empty }: OwnedTicketTableProps) {
  return (
    <ListCard>
      <ListHeaderRow grid={OWNED_GRID}>
        <span>Ref</span>
        <span>Subject</span>
        <span>Status</span>
        <span>Priority</span>
        <span>{dateLabel}</span>
        <span />
      </ListHeaderRow>
      {loading ? (
        <LoadingRows grid={OWNED_GRID} breakpoint="xl" rows={4} columns={["meta", "title", "badge", "badge", "meta", "icon"]} />
      ) : tickets.length === 0 ? (
        empty
      ) : (
        <ListBody>
          {tickets.map((t) => (
            <OwnedTicketRow key={t.ticket_id} ticket={t} to={`${basePath}/tickets/${t.ticket_id}`} />
          ))}
        </ListBody>
      )}
    </ListCard>
  );
}

function OwnedTicketRow({ ticket, to }: { ticket: Ticket; to: string }) {
  const updated = ticket.updated_at || ticket.created_at;
  return (
    <ListRow grid={OWNED_GRID} to={to} className="py-4">
      <TicketRef id={ticket.ticket_id} className="hidden xl:block" />
      <TicketSubject ticket={ticket} stackedMeta={ticket.category_name} />
      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:contents">
        <div className="flex shrink-0">
          <StatusBadge status={ticket.ticket_status} />
        </div>
        <div className="flex shrink-0">
          <PriorityBadge priority={ticket.ticket_priority} />
        </div>
        <span
          className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:ml-0 xl:text-sm"
          title={formatSast(updated, "full")}
        >
          {formatSast(updated, "smart")}
        </span>
        <ChevronRight
          className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 xl:block"
          aria-hidden
        />
      </div>
    </ListRow>
  );
}
