import { Navigate, useParams } from "react-router-dom";
import { AlarmClock, CircleCheck, Hourglass, Inbox, Lock, RotateCw, SearchX, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { formatTicketRef } from "@/lib/format";
import type { Ticket } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import UserAvatar from "@/components/app/UserAvatar";
import { ListCaption } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClaimButton, ClaimNextButton } from "@/components/queue/ClaimButton";
import LeadTicketList from "@/components/queue/LeadTicketList";
import QueueFilters from "@/components/queue/QueueFilters";
import { useDepartmentCategories, useQueueFilters } from "@/components/queue/useQueueFilters";
import QueueTable from "@/components/queue/QueueTable";
import { plural } from "@/components/queue/queueUtils";
import { useClaim, useClaimNextShortcut } from "@/components/queue/useClaim";
import { useTicketList } from "@/components/queue/useTicketList";
import { AGENT_VIEWS, agentQueuePath, isAgentQueueView, withTeam, type AgentQueueView } from "@/components/queue/queueViews";

const EMPTY_ICON: Record<AgentQueueView, LucideIcon> = {
  "my-open": Inbox,
  unassigned: CircleCheck,
  waiting: Hourglass,
  breached: AlarmClock,
  resolved: CircleCheck,
};

/**
 * The agent's queue views, one component for all five (briefing p.46-47), at /agent/queue/:view:
 * My open, Unassigned, Waiting on employee, Breached, Resolved by me. The server scopes to the
 * agent's department and sorts by SLA due, breached first.
 */
export default function TicketQueue() {
  const { user } = useAuth();
  const { view } = useParams();
  if (user?.role === "Department Lead") return <LeadTicketList />;
  if (!isAgentQueueView(view)) return <Navigate to={agentQueuePath("unassigned")} replace />;
  // A fresh component per view, so filters reset when the agent switches lists
  return <AgentQueue key={view} view={view} />;
}

/** "Waiting for an owner…" -> "waiting for an owner…" after "7 tickets ·" (sentence case) */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const claimable = (t: Ticket) => t.ticket_status === "New" && !t.assignee_id;

function AgentQueue({ view: key }: { view: AgentQueueView }) {
  const { user } = useAuth();
  const view = AGENT_VIEWS[key];
  const departmentName = useDepartmentName(user?.department_id ?? undefined);
  const team = departmentName ?? "your department";

  const filters = useQueueFilters();
  const categories = useDepartmentCategories(user?.department_id);
  const { tickets, total, loading, refetching, error, refetch, refresh } = useTicketList({
    ...view.params,
    ...filters.params,
    // The Breached view is sla=breached whatever the chip says (the chip is hidden there)
    sla: view.params.sla ?? filters.params.sla,
  });
  // Unfiltered size of the view, for "Showing 3 of 12 (filtered)"
  const { total: viewTotal } = useTicketList(view.params, { enabled: filters.active, refreshOnFocus: false });
  const outOf = filters.active ? viewTotal : total;

  const { claim, pendingId, busy } = useClaim({ basePath: "/agent", onDone: refresh, onConflict: refresh });

  const next = view.claimable ? tickets.find(claimable) : undefined;
  const claimNext = () => {
    if (next && !busy) void claim(next);
  };
  useClaimNextShortcut(claimNext, !!next && !busy && !loading);

  const description =
    loading || error || outOf === 0
      ? withTeam(view.description, team)
      : `${plural(outOf, "ticket")} · ${lowerFirst(withTeam(view.description, team))}`;
  const EmptyIcon = EMPTY_ICON[key];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={view.label}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={() => void refetch()} disabled={loading || refetching} className="h-10 sm:h-9">
              <RotateCw data-icon="inline-start" className={refetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
            {view.claimable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={next ? -1 : 0} className="inline-flex">
                    <ClaimNextButton onClick={claimNext} disabled={!next || loading} busy={busy && pendingId === next?.ticket_id} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {next ? `Claims ${formatTicketRef(next.ticket_id)}, the most at-risk ticket` : "Nothing to claim"}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        }
      />

      <QueueFilters filters={filters} categories={categories} hideSla={!!view.params.sla || view.finished} searchId="queue-search" />

      {error && !loading ? (
        <ErrorState
          title={`Couldn't load ${view.label.toLowerCase()}`}
          description={error.status === 0 ? undefined : error.message}
          onRetry={() => void refetch()}
          retrying={refetching}
        />
      ) : (
        <QueueTable
          variant="agent"
          tickets={tickets}
          loading={loading}
          basePath="/agent"
          viewId={view.id}
          finished={view.finished}
          showStatus={key === "my-open" || key === "resolved"}
          trailing={
            view.claimable
              ? (t) =>
                  claimable(t) ? (
                    <ClaimButton ticketId={t.ticket_id} onClaim={() => void claim(t)} claiming={pendingId === t.ticket_id} disabled={busy} />
                  ) : (
                    <Owner name={t.assignee_name} />
                  )
              : undefined
          }
          empty={
            filters.active ? (
              <EmptyState
                icon={SearchX}
                title="Nothing matches these filters"
                description="Try another priority, category or search."
                action={
                  <Button variant="outline" onClick={filters.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={EmptyIcon} title={view.empty.title} description={withTeam(view.empty.description, team)} />
            )
          }
        />
      )}

      {!loading && !error && (
        <ListCaption className="-mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          {outOf > 0 && (
            <>
              <span>
                Showing {tickets.length} of {outOf}
                {filters.active ? " (filtered)" : ""}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3 shrink-0" aria-hidden />
            Only {team} tickets are listed, enforced by the server. Other departments' requests never appear here.
          </span>
        </ListCaption>
      )}
    </div>
  );
}

/** Someone already owns it (Breached view): their avatar, name on hover */
function Owner({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative z-10 flex">
          <UserAvatar name={name} size="sm" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Owned by {name}</TooltipContent>
    </Tooltip>
  );
}
