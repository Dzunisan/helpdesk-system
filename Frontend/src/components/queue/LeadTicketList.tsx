import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Inbox, Lock, RotateCw, SearchX, SignalHigh, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTickets } from "@/hooks/useTickets";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { fetchAgents } from "@/services/ticketService";
import { homePathFor } from "@/lib/roles";
import { formatAge, formatSast } from "@/lib/format";
import { PRIORITY_LABEL, toPriority, toStatus, type Priority } from "@/lib/ticketVocabulary";
import type { AgentUser, Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AssignMenu from "./AssignMenu";
import FilterSelect from "./FilterSelect";
import TicketSubject from "./TicketSubject";
import { byRecentlyUpdated, byUrgency, isActive, matchesSearch, plural } from "./queueUtils";
import { useClaim } from "./useClaim";

type TabKey = "unassigned" | "open" | "pending" | "resolved" | "closed";
type PriorityFilter = "all" | Priority;

const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: "unassigned", label: "Unassigned", empty: "Every ticket has an owner." },
  { key: "open", label: "Open", empty: "Nobody on the team is working a ticket right now." },
  { key: "pending", label: "Pending approval", empty: "No requests are waiting for approval." },
  { key: "resolved", label: "Resolved", empty: "Resolved tickets show up here until they close." },
  { key: "closed", label: "Closed", empty: "Closed and cancelled tickets show up here." },
];

/** Which tab a ticket belongs to */
function tabOf(ticket: Ticket): TabKey {
  const status = toStatus(ticket.ticket_status);
  if (status === "new") return ticket.assignee_id ? "open" : "unassigned";
  if (status === "open" || status === "waiting") return "open";
  if (status === "pending") return "pending";
  if (status === "resolved") return "resolved";
  return "closed"; // closed + cancelled
}

// Ref · Subject + requester · Category · Priority · Age · Assignee (briefing p.55). Below xl, rows stack.
const LEAD_GRID =
  "xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_10.5rem_6rem_4.5rem_9.5rem] xl:items-center xl:gap-4";

/** Department Lead: every ticket in the department, by status (p.55). Lives on /department-lead. */
export default function LeadTicketList() {
  const { user } = useAuth();
  const basePath = homePathFor(user?.role);
  const userId = user?.user_id ?? user?.id;

  const [tab, setTab] = useState<TabKey>("unassigned");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [search, setSearch] = useState("");

  // The server scopes a lead to the department(s) they lead; no status filter so every tab has data
  const { tickets, loading, isRefetching, error, claimTicket, refetch } = useTickets({
    filters: { limit: 100 },
    autoFetch: true,
  });

  // The team for the Assign menu
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [agentsError, setAgentsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAgents()
      .then((list) => !cancelled && setAgents(list))
      .catch(() => !cancelled && setAgentsError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentName =
    useDepartmentName(user?.department_id) ?? tickets.find((t) => t.department_name)?.department_name ?? null;
  const teamLabel = departmentName ?? "your department";

  const { claim, pendingId, busy } = useClaim({ claimTicket, basePath, onConflict: refetch });

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = { unassigned: 0, open: 0, pending: 0, resolved: 0, closed: 0 };
    for (const t of tickets) result[tabOf(t)] += 1;
    return result;
  }, [tickets]);

  // Each person's current load, for the Assign menu ("5 open")
  const load = useMemo(() => {
    const result: Record<string, number> = {};
    for (const t of tickets) if (t.assignee_id && isActive(t)) result[t.assignee_id] = (result[t.assignee_id] ?? 0) + 1;
    return result;
  }, [tickets]);

  const activeCount = useMemo(() => tickets.filter(isActive).length, [tickets]);
  const finished = tab === "resolved" || tab === "closed";

  const visible = useMemo(
    () =>
      tickets
        .filter(
          (t) =>
            tabOf(t) === tab &&
            (priority === "all" || toPriority(t.ticket_priority) === priority) &&
            matchesSearch(t, search),
        )
        .sort(finished ? byRecentlyUpdated : byUrgency),
    [tickets, tab, priority, search, finished],
  );
  const inTab = counts[tab];
  const tabMeta = TABS.find((tb) => tb.key === tab)!;
  const filtersActive = priority !== "all" || search.trim() !== "";

  const priorityOptions: { value: PriorityFilter; label: string }[] = [
    { value: "all", label: "All priorities" },
    ...(["urgent", "high", "normal", "low"] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
  ];

  const description = loading || error
    ? `Every ticket in ${teamLabel}, by status`
    : `${teamLabel} · ${plural(activeCount, "active ticket")}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="All tickets"
        description={description}
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={loading || isRefetching} className="h-10 sm:h-9">
            <RotateCw data-icon="inline-start" className={isRefetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <Toolbar>
        <FilterTabs
          aria-label="Filter tickets by status"
          value={tab}
          onValueChange={setTab}
          items={TABS.map((tb) => ({
            value: tb.key,
            label: tb.label,
            count: loading || error ? undefined : counts[tb.key],
          }))}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterSelect
            label="Filter by priority"
            icon={SignalHigh}
            value={priority}
            onValueChange={setPriority}
            options={priorityOptions}
          />
          <SearchInput
            id="lead-ticket-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search subject, requester or HD"
            className="sm:w-64"
          />
        </div>
      </Toolbar>

      {error && !loading ? (
        <ErrorState title="Couldn't load the department's tickets" onRetry={() => refetch()} retrying={isRefetching} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={LEAD_GRID}>
            <span>Ref</span>
            <span>Subject</span>
            <span>Category</span>
            <span>Priority</span>
            <span>{finished ? "Updated" : "Age"}</span>
            <span>Assignee</span>
          </ListHeaderRow>

          {loading ? (
            <LoadingRows
              grid={LEAD_GRID}
              breakpoint="xl"
              rows={5}
              columns={["meta", "title", "text", "badge", "meta", "avatar"]}
            />
          ) : visible.length === 0 ? (
            inTab === 0 ? (
              <EmptyState icon={Inbox} title={`No ${tabMeta.label.toLowerCase()} tickets`} description={tabMeta.empty} />
            ) : (
              <EmptyState
                icon={SearchX}
                title="Nothing matches these filters"
                description="Try another priority or a different search."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPriority("all");
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <ListBody>
              {visible.map((t) => (
                <LeadRow
                  key={t.ticket_id}
                  ticket={t}
                  to={`${basePath}/tickets/${t.ticket_id}`}
                  finished={finished}
                  showStatus={tab === "closed" || tab === "open"}
                  assignSlot={
                    tab === "unassigned" ? (
                      <AssignMenu
                        ticket={t}
                        agents={agents}
                        load={load}
                        currentUserId={userId ? String(userId) : undefined}
                        agentsError={agentsError}
                        assigning={pendingId === t.ticket_id}
                        disabled={busy}
                        onAssign={(agent) =>
                          claim(t, String(agent.id) === String(userId) ? undefined : agent)
                        }
                      />
                    ) : null
                  }
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!loading && !error && (
        <ListCaption className="-mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          {inTab > 0 && (
            <>
              <span>
                Showing {visible.length} of {inTab} {tabMeta.label.toLowerCase()}
                {filtersActive ? " (filtered)" : ""}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3 shrink-0" aria-hidden />
            Only {teamLabel} tickets are listed, enforced by the server.
          </span>
        </ListCaption>
      )}
    </div>
);
}

function LeadRow({
ticket,
to,
finished,
showStatus,
assignSlot,
}: {
ticket: Ticket;
to: string;
finished: boolean;
/** For tabs that mix statuses (Open + Waiting, Closed + Cancelled) */
showStatus: boolean;
assignSlot: ReactNode;
}) {
const status = toStatus(ticket.ticket_status);
const mixed = showStatus && (status === "waiting" || status === "cancelled");
const when = finished ? formatSast(ticket.updated_at || ticket.created_at, "day") : formatAge(ticket.created_at);
const whenTitle = finished
  ? `Last updated ${formatSast(ticket.updated_at || ticket.created_at, "full")}`
  : `Created ${formatSast(ticket.created_at, "full")}`;

return (
  <ListRow grid={LEAD_GRID} className="py-4">
    <TicketRef id={ticket.ticket_id} className="hidden xl:block" />
    <TicketSubject
      ticket={ticket}
      to={to}
      stackedMeta={ticket.category_name}
      aside={mixed ? <StatusBadge status={ticket.ticket_status} className="ml-1 align-middle" /> : undefined}
    />

    <div className="flex min-w-0 items-center gap-3 xl:contents">
      <span className="hidden truncate text-sm text-muted-foreground xl:block">{ticket.category_name ?? "—"}</span>
      <div className="flex shrink-0">
        <PriorityBadge priority={ticket.ticket_priority} />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative z-10 w-fit shrink-0 text-xs text-muted-foreground tabular-nums xl:text-sm">
            {when}
          </span>
        </TooltipTrigger>
        <TooltipContent>{whenTitle}</TooltipContent>
      </Tooltip>
      <div className="ml-auto flex min-w-0 justify-end xl:ml-0 xl:justify-start">
        {assignSlot ?? <Assignee ticket={ticket} />}
      </div>
    </div>
    </ListRow>
  );
}

function Assignee({ ticket }: { ticket: Ticket }) {
  if (ticket.assignee_id && ticket.assignee_name) return <UserAvatar name={ticket.assignee_name} size="sm" showName />;
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      <span className="truncate">Unassigned</span>
    </span>
  );
}
