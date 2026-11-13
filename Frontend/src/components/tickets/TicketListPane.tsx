import { useEffect, useRef } from "react";
import { CircleCheck, RotateCw } from "lucide-react";
import type { Ticket } from "@/types/api";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import EmptyState from "@/components/app/EmptyState";
import { ListBody, ListRow } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rowClock } from "@/components/queue/ticketSla";
import { useTicketList } from "@/components/queue/useTicketList";
import type { TicketLinkState, TicketView } from "@/components/queue/queueViews";

interface TicketListPaneProps {
  view: TicketView;
  /** "/agent" or "/department-lead" */
  basePath: string;
  currentId: number;
  /** Bump to refresh the list after a change on the open ticket */
  refreshKey: number;
}

/**
 * The inbox's left pane (briefing p.48): the list the agent came from (My open, Unassigned...),
 * so they move ticket to ticket without going back. The open ticket is highlighted.
 */
export default function TicketListPane({ view, basePath, currentId, refreshKey }: TicketListPaneProps) {
  const { tickets, total, loading, error, refetch, refresh } = useTicketList(view.params, { filter: view.filter });
  useRefreshOn(refreshKey, refresh);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-foreground">
          <span className="truncate">{view.label}</span>
          {!loading && !error && <span className="text-xs font-normal text-muted-foreground tabular-nums">{view.filter ? tickets.length : total}</span>}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">{view.finished ? "Most recent" : "Due soonest"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <PaneSkeleton />
        ) : error ? (
          <div className="flex flex-col items-start gap-3 p-4 text-sm text-destructive">
            Couldn't load {view.label.toLowerCase()}.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RotateCw data-icon="inline-start" />
              Try again
            </Button>
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState size="compact" icon={CircleCheck} title={view.empty.title} className="px-4" />
        ) : (
          <ListBody>
            {tickets.map((t) => (
              <PaneRow key={t.ticket_id} ticket={t} to={`${basePath}/tickets/${t.ticket_id}`} state={{ view: view.id }} selected={t.ticket_id === currentId} />
            ))}
          </ListBody>
        )}
      </div>
    </div>
  );
}

function PaneRow({ ticket, to, state, selected }: { ticket: Ticket; to: string; state: TicketLinkState; selected: boolean }) {
  const clock = rowClock(ticket);
  const meta = [ticket.requester_name, ticket.category_name].filter(Boolean).join(" · ");
  return (
    <ListRow grid="" to={to} state={state} selected={selected} className="gap-1.5 px-4 py-3.5" aria-label={`${ticket.title}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="flex shrink-0 items-center gap-2">
          <TicketRef id={ticket.ticket_id} className="whitespace-nowrap" />
          <PriorityBadge priority={ticket.ticket_priority} className="h-5 px-1.5 text-[11px]" />
        </span>
        {clock ? <SlaChip due={clock.due} met={clock.met} start={clock.start} className="h-5 text-[11px]" /> : <StatusBadge status={ticket.ticket_status} />}
      </div>
      <span className="line-clamp-2 text-sm font-medium text-foreground">{ticket.title}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{meta || "No details"}</span>
        {ticket.ticket_status === "Waiting on employee" && <StatusBadge status={ticket.ticket_status} className="h-5 shrink-0 text-[11px]" />}
      </span>
    </ListRow>
  );
}

/** Calls `refresh` whenever `key` changes after the first render */
function useRefreshOn(key: number, refresh: () => unknown) {
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    void refresh();
  }, [key, refresh]);
}

function PaneSkeleton() {
  const SK = "bg-foreground/[0.07]";
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex justify-between">
            <Skeleton className={`h-3 w-20 ${SK}`} />
            <Skeleton className={`h-4 w-16 rounded-full ${SK}`} />
          </div>
          <Skeleton className={`h-4 ${["w-4/5", "w-3/5", "w-2/3"][i % 3]} ${SK}`} />
          <Skeleton className={`h-3 w-32 ${SK}`} />
        </li>
      ))}
    </ul>
  );
}
