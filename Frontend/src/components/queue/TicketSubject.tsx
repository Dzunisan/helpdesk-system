import type { ReactNode } from "react";
import type { Ticket } from "@/types/ticket.types";
import { ListRowLink } from "@/components/app/ListCard";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { cn } from "@/lib/utils";

interface TicketSubjectProps {
  ticket: Ticket;
  /** Makes the title a ListRowLink (whole row clickable, buttons stay usable). Leave out inside a ListRow with `to`. */
  to?: string;
  /**
   * Shown above the title only while rows are stacked (below `wideAt`), where the Ref
   * column is hidden: the ref plus this text, e.g. the age.
   */
  stackedMeta?: ReactNode;
  /** Breakpoint at which the separate Ref column appears (hides the stacked meta line) */
  wideAt?: "lg" | "xl";
  /** Extra text after the requester, e.g. the category on narrow layouts */
  aside?: ReactNode;
  className?: string;
}

const HIDE_AT = { lg: "lg:hidden", xl: "xl:hidden" } as const;

/** Subject cell: (stacked ref line) · title · small avatar + requester, like briefing p.47 */
export default function TicketSubject({ ticket, to, stackedMeta, wideAt = "xl", aside, className }: TicketSubjectProps) {
  const title = (
    <span className="line-clamp-2 text-sm font-medium text-foreground xl:line-clamp-1 xl:block xl:truncate">{ticket.title}</span>
  );
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <p className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums", HIDE_AT[wideAt])}>
        <TicketRef id={ticket.ticket_id} />
        {stackedMeta && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{stackedMeta}</span>
          </>
        )}
      </p>
      {to ? (
        <ListRowLink to={to} className="min-w-0 rounded-sm">
          {title}
        </ListRowLink>
      ) : (
        title
      )}
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <UserAvatar name={ticket.requester_name || "Unknown"} size="sm" className="data-[size=sm]:size-5" />
        <span className="truncate">
          {ticket.requester_name || "Unknown requester"}
          {aside && <> · {aside}</>}
        </span>
      </span>
    </div>
  );
}
