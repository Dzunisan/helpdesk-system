import { useMemo, useState } from "react";
import { CircleCheck, Lock, RotateCw, SearchX, Shapes } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTickets } from "@/hooks/useTickets";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { homePathFor } from "@/lib/roles";
import { formatAge, formatSast, formatTicketRef } from "@/lib/format";
import { PRIORITY_LABEL, toPriority, type Priority } from "@/lib/ticketVocabulary";
import type { Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import TicketRef from "@/components/app/TicketRef";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClaimButton, ClaimNextButton } from "@/components/queue/ClaimButton";
import FilterSelect from "@/components/queue/FilterSelect";
import LeadTicketList from "@/components/queue/LeadTicketList";
import TicketSubject from "@/components/queue/TicketSubject";
import { byUrgency, isUnassigned, matchesSearch, plural } from "@/components/queue/queueUtils";
import { useClaim, useClaimNextShortcut } from "@/components/queue/useClaim";

type PriorityFilter = "all" | Priority;

const ALL_CATEGORIES = "__all";
const NO_CATEGORY = "__none";

// Ref · Subject + requester · Category · Priority · Age · Claim (briefing p.47). Below xl, rows stack.
const QUEUE_GRID =
  "xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_11rem_6rem_4.5rem_5rem] xl:items-center xl:gap-5";

/**
 * Agents: the unassigned queue (p.47). Department Leads land on the same route
 * (/department-lead and /department-lead/ticket-queue) and get every department ticket (p.55).
 */
export default function TicketQueue() {
  const { user } = useAuth();
  if (user?.role === "Department Lead") return <LeadTicketList />;
  return <AgentQueue />;
}

function AgentQueue() {
  const { user } = useAuth();
  const basePath = homePathFor(user?.role);
  const departmentId = user?.department_id ?? undefined;

  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [search, setSearch] = useState("");

  // Unassigned "Open" tickets; the server limits them to the agent's own department
  const { tickets, loading, isRefetching, error, claimTicket, refetch } = useTickets({
    filters: {
      status: "Open",
      department_id: departmentId ? Number(departmentId) : undefined,
      limit: 100,
    },
    autoFetch: true,
  });

  const departmentName =
    useDepartmentName(departmentId) ?? tickets.find((t) => t.department_name)?.department_name ?? null;
  const teamLabel = departmentName ?? "your department";

  const { claim, pendingId, busy } = useClaim({ claimTicket, basePath, onConflict: refetch });

  // Most urgent first: highest priority, then oldest
  const queue = useMemo(() => tickets.filter(isUnassigned).sort(byUrgency), [tickets]);

  const priorityCounts = useMemo(() => {
    const result: Record<Priority, number> = { urgent: 0, high: 0, normal: 0, low: 0 };
    for (const t of queue) result[toPriority(t.ticket_priority)] += 1;
    return result;
  }, [queue]);

  const categories = useMemo(() => {
    const names = new Set<string>();
    let hasNone = false;
    for (const t of queue) {
      if (t.category_name) names.add(t.category_name);
      else hasNone = true;
    }
    return [
      { value: ALL_CATEGORIES, label: "All categories" },
      ...[...names].sort().map((name) => ({ value: name, label: name })),
      ...(hasNone ? [{ value: NO_CATEGORY, label: "No category" }] : []),
    ];
  }, [queue]);

  const visible = useMemo(
    () =>
      queue.filter((t) => {
        if (priority !== "all" && toPriority(t.ticket_priority) !== priority) return false;
        if (category === NO_CATEGORY && t.category_name) return false;
        if (category !== ALL_CATEGORIES && category !== NO_CATEGORY && t.category_name !== category) return false;
        return matchesSearch(t, search);
      }),
    [queue, priority, category, search],
  );

  // Priorities that exist in the data model; Urgent only shows once tickets use it
  const priorityTabs: { value: PriorityFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: loading || error ? undefined : queue.length },
    ...(["urgent", "high", "normal", "low"] as Priority[])
      .filter((p) => p !== "urgent" || priorityCounts.urgent > 0)
      .map((p) => ({ value: p, label: PRIORITY_LABEL[p], count: loading || error ? undefined : priorityCounts[p] })),
  ];

  const filtersActive = priority !== "all" || category !== ALL_CATEGORIES || search.trim() !== "";
  const clearFilters = () => {
    setPriority("all");
    setCategory(ALL_CATEGORIES);
    setSearch("");
  };

  const next = queue[0];
  const claimNext = () => {
    if (next && !busy) claim(next);
  };
  useClaimNextShortcut(claimNext, !!next && !busy && !loading);

  const description =
    loading || error
      ? `Tickets in ${teamLabel} waiting for an owner`
      : queue.length === 0
        ? `Nothing waiting in ${teamLabel}`
        : `${plural(queue.length, "ticket")} in ${teamLabel} · highest priority first, then oldest`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Unassigned"
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()} disabled={loading || isRefetching} className="h-10 sm:h-9">
              <RotateCw data-icon="inline-start" className={isRefetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={next ? -1 : 0} className="inline-flex">
                  <ClaimNextButton onClick={claimNext} disabled={!next || loading} busy={busy && pendingId === next?.ticket_id} />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {next ? `Claims ${formatTicketRef(next.ticket_id)}, the most urgent ticket` : "Nothing to claim"}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />

      <Toolbar>
        <FilterTabs aria-label="Filter by priority" value={priority} onValueChange={setPriority} items={priorityTabs} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterSelect
            label="Filter by category"
            icon={Shapes}
            value={category}
            onValueChange={setCategory}
            options={categories}
            className="sm:max-w-56"
          />
          <SearchInput
            id="queue-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search subject, requester or HD"
          />
        </div>
      </Toolbar>

      {error && !loading ? (
        <ErrorState title="Couldn't load the queue" onRetry={() => refetch()} retrying={isRefetching} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={QUEUE_GRID}>
            <span>Ref</span>
            <span>Subject</span>
            <span>Category</span>
            <span>Priority</span>
            <span>Age</span>
            <span className="sr-only">Claim</span>
          </ListHeaderRow>

          {loading ? (
            <LoadingRows
              grid={QUEUE_GRID}
              breakpoint="xl"
              rows={5}
              columns={["meta", "title", "text", "badge", "meta", "button"]}
            />
          ) : visible.length === 0 ? (
            queue.length === 0 ? (
              <EmptyState
                icon={CircleCheck}
                title="Queue clear"
                description={`Nothing unassigned in ${teamLabel}. New requests land here first.`}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="Nothing matches these filters"
                description="Try another priority or category, or a different search."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <ListBody>
              {visible.map((t: Ticket) => (
                <QueueRow
                  key={t.ticket_id}
                  ticket={t}
                  to={`${basePath}/tickets/${t.ticket_id}`}
                  claiming={pendingId === t.ticket_id}
                  disabled={busy}
                  onClaim={() => claim(t)}
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!loading && !error && (
        <ListCaption className="-mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          {queue.length > 0 && (
            <>
              <span>
                Showing {visible.length} of {queue.length}
                {filtersActive ? " (filtered)" : ""}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3 shrink-0" aria-hidden />
            Only {teamLabel} tickets are listed, enforced by the server. Other departments' requests never appear here.
          </span>
        </ListCaption>
      )}
    </div>
  );
}

function QueueRow({
  ticket,
  to,
  claiming,
  disabled,
  onClaim,
}: {
  ticket: Ticket;
  to: string;
  claiming: boolean;
  disabled: boolean;
  onClaim: () => void;
}) {
  const age = formatAge(ticket.created_at);
  return (
    <ListRow grid={QUEUE_GRID} className="py-4">
      <TicketRef id={ticket.ticket_id} className="hidden xl:block" />
      <TicketSubject ticket={ticket} to={to} stackedMeta={ticket.category_name} />

      <div className="flex min-w-0 items-center gap-3 xl:contents">
        <span className="hidden truncate text-sm text-muted-foreground xl:block">{ticket.category_name ?? "—"}</span>
        <div className="flex shrink-0">
          <PriorityBadge priority={ticket.ticket_priority} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative z-10 w-fit text-xs text-muted-foreground tabular-nums xl:text-sm">
              {age}
              <span className="xl:hidden"> old</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Created {formatSast(ticket.created_at, "full")}</TooltipContent>
        </Tooltip>
        <div className="ml-auto shrink-0 xl:ml-0 xl:flex xl:justify-end">
          <ClaimButton ticketId={ticket.ticket_id} onClaim={onClaim} claiming={claiming} disabled={disabled} />
        </div>
      </div>
    </ListRow>
  );
}
