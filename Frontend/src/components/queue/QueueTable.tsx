import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Ticket } from "@/types/api";
import { formatAge, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { ListBody, ListCard, ListHeaderRow, ListRow, ListRowLink, LoadingRows } from "@/components/app/ListCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { rowClock } from "./ticketSla";
import type { TicketLinkState } from "./queueViews";

/*
 * The one dense ticket table (briefing p.47 agent queues, p.55 lead All tickets). Rows come
 * sorted by the server (sort=due: breached first, then nearest due). One grid string per
 * variant is shared by the header, the rows and the skeletons so columns line up; below xl the
 * rows stack as cards. The Category column appears from xl on the agent queues (page 47) and from
 * 2xl on the lead's wider list (it moves under the title before that).
 *
 *   agent: Ref · Subject + requester · (Category) · Priority · SLA · Age · Claim
 *   lead:  [ ] · Ref · Subject + requester · (Category) · Priority · SLA · Age · Assignee
 */
const AGENT_GRID =
  "xl:grid xl:grid-cols-[3.75rem_minmax(0,1fr)_8.5rem_6.5rem_10.5rem_4rem_5.5rem] xl:items-center xl:gap-4 2xl:grid-cols-[3.75rem_minmax(0,1fr)_9.5rem_6.5rem_10.5rem_4rem_5.5rem]";
const LEAD_GRID =
  "xl:grid xl:grid-cols-[1rem_3.75rem_minmax(0,1fr)_6.5rem_10.5rem_3.5rem_9.5rem] xl:items-center xl:gap-4 2xl:grid-cols-[1rem_3.75rem_minmax(0,1fr)_9.5rem_6.5rem_10.5rem_3.5rem_10rem]";

export interface QueueSelection {
  selected: Set<number>;
  onToggle: (ticketId: number, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}

interface QueueTableProps {
  variant: "agent" | "lead";
  tickets: Ticket[];
  loading: boolean;
  /** Base path for the row links: "/agent" or "/department-lead" */
  basePath: string;
  /** The view id the ticket page shows in its left pane ("agent:unassigned") */
  viewId: string;
  /** Finished work: "Updated" instead of "Age" */
  finished?: boolean;
  /** Show the status next to the requester (views that mix statuses); plain Open needs no badge */
  showStatus?: boolean;
  /** Last column: Claim button (agent) or Assign menu (lead). Leave out for a chevron. */
  trailing?: (ticket: Ticket) => ReactNode;
  /** Header text of the last column */
  trailingLabel?: string;
  /** Lead only: row checkboxes for the bulk bar */
  selection?: QueueSelection;
  /** Rendered instead of rows when there are none */
  empty: ReactNode;
}

export default function QueueTable({
  variant,
  tickets,
  loading,
  basePath,
  viewId,
  finished,
  showStatus,
  trailing,
  trailingLabel,
  selection,
  empty,
}: QueueTableProps) {
  const lead = variant === "lead";
  const grid = lead ? LEAD_GRID : AGENT_GRID;
  const allSelected = !!selection && tickets.length > 0 && tickets.every((t) => selection.selected.has(t.ticket_id));
  const someSelected = !!selection && tickets.some((t) => selection.selected.has(t.ticket_id));

  return (
    <ListCard>
      <ListHeaderRow grid={grid}>
        {lead && (
          <span className="flex">
            {selection && (
              <Checkbox
                aria-label="Select every ticket on this tab"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => selection.onToggleAll(checked === true)}
                disabled={loading || tickets.length === 0}
              />
            )}
          </span>
        )}
        <span>Ref</span>
        <span>Subject</span>
        <span className={cn("hidden", lead ? "2xl:block" : "xl:block")}>Category</span>
        <span>Priority</span>
        <span>SLA</span>
        <span>{finished ? "Updated" : "Age"}</span>
        <span className={cn(!trailingLabel && "sr-only")}>{trailingLabel ?? "Open"}</span>
      </ListHeaderRow>

      {loading ? (
        <LoadingRows
          grid={grid}
          breakpoint="xl"
          rows={6}
          columns={
            lead
              ? ["blank", "meta", "title", "badge", "badge", "meta", "button"]
              : ["meta", "title", "meta", "badge", "badge", "meta", "button"]
          }
        />
      ) : tickets.length === 0 ? (
        empty
      ) : (
        <ListBody>
          {tickets.map((t) => (
            <QueueRow
              key={t.ticket_id}
              ticket={t}
              grid={grid}
              lead={lead}
              to={`${basePath}/tickets/${t.ticket_id}`}
              state={{ view: viewId } satisfies TicketLinkState}
              finished={finished}
              showStatus={showStatus}
              trailing={trailing?.(t)}
              selection={selection}
            />
          ))}
        </ListBody>
      )}
    </ListCard>
  );
}

function QueueRow({
  ticket,
  grid,
  lead,
  to,
  state,
  finished,
  showStatus,
  trailing,
  selection,
}: {
  ticket: Ticket;
  grid: string;
  lead: boolean;
  to: string;
  state: TicketLinkState;
  finished?: boolean;
  showStatus?: boolean;
  trailing?: ReactNode;
  selection?: QueueSelection;
}) {
  const clock = rowClock(ticket);
  const checked = selection?.selected.has(ticket.ticket_id) ?? false;
  const updated = ticket.resolved_at ?? ticket.updated_at ?? ticket.created_at;
  const when = finished ? formatSast(updated, "smart") : formatAge(ticket.created_at);
  const whenTitle = finished ? `Updated ${formatSast(updated, "full")}` : `Created ${formatSast(ticket.created_at, "full")}`;
  const category = ticket.category_name ?? ticket.department_name;

  return (
    <ListRow grid={grid} selected={checked} className="gap-3 py-4 xl:py-5">
      {lead && (
        <span className="relative z-10 hidden xl:flex">
          {selection && (
            <Checkbox
              aria-label={`Select ${ticket.title}`}
              checked={checked}
              onCheckedChange={(value) => selection.onToggle(ticket.ticket_id, value === true)}
            />
          )}
        </span>
      )}
      <TicketRef id={ticket.ticket_id} className="hidden xl:block" />

      {/* Subject: (stacked ref line) · title · requester (· category below 2xl) */}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground xl:hidden">
          <TicketRef id={ticket.ticket_id} />
          {category && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{category}</span>
            </>
          )}
        </p>
        <ListRowLink to={to} state={state} className="min-w-0 rounded-sm">
          <span className="line-clamp-2 text-sm font-medium text-foreground">{ticket.title}</span>
        </ListRowLink>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <UserAvatar name={ticket.requester_name || "Unknown"} size="sm" className="data-[size=sm]:size-5" />
          <span className="truncate">
            {ticket.requester_name || "Unknown requester"}
            {category && lead && <span className="hidden xl:inline 2xl:hidden"> · {category}</span>}
          </span>
          {showStatus && ticket.ticket_status !== "Open" && <StatusBadge status={ticket.ticket_status} className="shrink-0" />}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 xl:contents">
        <span className={cn("hidden truncate text-sm text-muted-foreground", lead ? "2xl:block" : "xl:block")}>{category ?? "—"}</span>
        <div className="flex shrink-0">
          <PriorityBadge priority={ticket.ticket_priority} />
        </div>
        <div className="flex shrink-0">
          {clock ? (
            <SlaChip due={clock.due} met={clock.met} start={clock.start} />
          ) : (
            <span className="text-xs text-muted-foreground">{ticket.ticket_status === "Pending approval" ? "Starts on approval" : "—"}</span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative z-10 w-fit text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:text-sm">
              {when}
              {!finished && <span className="xl:hidden"> old</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent>{whenTitle}</TooltipContent>
        </Tooltip>
        <div className={cn("ml-auto flex min-w-0 shrink-0 justify-end xl:ml-0", lead && "xl:justify-start")}>
          {trailing ?? (
            <ChevronRight
              className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 xl:block"
              aria-hidden
            />
          )}
        </div>
      </div>
    </ListRow>
  );
}

/** Owner of a ticket in a read-only Assignee cell */
export function AssigneeCell({ name }: { name: string | null }) {
  if (name) return <UserAvatar name={name} size="sm" showName className="max-w-full" />;
  return <span className="text-sm text-muted-foreground">Unassigned</span>;
}
