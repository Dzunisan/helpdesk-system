import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Inbox, Lock, RotateCw, SearchX, SignalHigh, Truck, UserRoundPlus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs } from "@/components/app/Toolbar";
import { ListCaption } from "@/components/app/ListCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AssignMenu from "./AssignMenu";
import QueueFilters from "./QueueFilters";
import { useDepartmentCategories, useQueueFilters } from "./useQueueFilters";
import QueueTable, { AssigneeCell } from "./QueueTable";
import { plural } from "./queueUtils";
import { LEAD_TABS, LEAD_VIEWS, isLeadTab, withTeam, type LeadTab } from "./queueViews";
import { useClaim } from "./useClaim";
import { useTeam } from "./useTeam";
import { useTicketCount, useTicketList } from "./useTicketList";

/** Tabs whose tickets can still be (re)assigned: New, Open, Waiting on employee */
const ASSIGNABLE: LeadTab[] = ["unassigned", "open", "waiting"];

/**
 * Department Lead, All tickets (briefing p.55): tabs by status with counts, the same table, chips
 * and SLA rules as the agent queue, an Assignee column whose dropdown shows each agent's open
 * load, and a bulk bar that stays disabled until N4. The server scopes everything to the lead's
 * department.
 */
export default function LeadTicketList() {
  const { user } = useAuth();
  const userId = String(user?.user_id ?? user?.id ?? "");
  const departmentName = useDepartmentName(user?.department_id ?? undefined);
  const team = departmentName ?? "your department";

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: LeadTab = isLeadTab(tabParam) ? tabParam : "unassigned";
  const view = LEAD_VIEWS[tab];
  const setTab = (next: LeadTab) => {
    setSelected(new Set());
    setSearchParams(next === "unassigned" ? {} : { tab: next }, { replace: true });
  };

  const filters = useQueueFilters();
  const categories = useDepartmentCategories(user?.department_id);
  const { tickets, loading, refetching, error, refetch, refresh } = useTicketList(
    { ...view.params, ...filters.params },
    { filter: view.filter },
  );

  // Tab counts: totals from the server; Resolved (7 days) needs the dates, so it loads the list
  const counts = {
    unassigned: useTicketCount(LEAD_VIEWS.unassigned.params),
    open: useTicketCount(LEAD_VIEWS.open.params),
    waiting: useTicketCount(LEAD_VIEWS.waiting.params),
    pending: useTicketCount(LEAD_VIEWS.pending.params),
  };
  const resolvedWeek = useTicketList(LEAD_VIEWS.resolved.params, { filter: LEAD_VIEWS.resolved.filter, refreshOnFocus: false });
  const countOf = (t: LeadTab): number | undefined =>
    t === "resolved" ? (resolvedWeek.loading ? undefined : resolvedWeek.tickets.length) : (counts[t].count ?? undefined);
  const activeTotal = (["unassigned", "open", "waiting", "pending"] as const).reduce((sum, t) => sum + (counts[t].count ?? 0), 0);
  const countsReady = (["unassigned", "open", "waiting", "pending"] as const).every((t) => counts[t].count !== null);

  const staff = useTeam();
  const reloadAll = () => {
    void refresh();
    for (const t of ["unassigned", "open", "waiting", "pending"] as const) counts[t].reload();
    staff.reload();
  };
  const { assign, pendingId, busy } = useClaim({ basePath: "/department-lead", onDone: reloadAll, onConflict: reloadAll });

  // Bulk selection (the bar's actions arrive with N4)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(tickets.map((t) => t.ticket_id)) : new Set());
  const selectedCount = tickets.filter((t) => selected.has(t.ticket_id)).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="All tickets"
        description={countsReady ? `${team} · ${plural(activeTotal, "active ticket")}` : `Every ticket in ${team}, by status`}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void refetch();
              reloadAll();
            }}
            disabled={loading || refetching}
            className="h-10 sm:h-9"
          >
            <RotateCw data-icon="inline-start" className={refetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <FilterTabs
          aria-label="Tickets by status"
          value={tab}
          onValueChange={setTab}
          items={LEAD_TABS.map((t) => ({ value: t, label: LEAD_VIEWS[t].label, count: countOf(t) }))}
        />
        <QueueFilters filters={filters} categories={categories} hideSla={view.finished || tab === "pending"} searchId="lead-ticket-search" />
      </div>

      {selectedCount > 0 && <BulkBar count={selectedCount} onClear={() => setSelected(new Set())} />}

      {error && !loading ? (
        <ErrorState
          title="Couldn't load the department's tickets"
          description={error.status === 0 ? undefined : error.message}
          onRetry={() => void refetch()}
          retrying={refetching}
        />
      ) : (
        <QueueTable
          variant="lead"
          tickets={tickets}
          loading={loading}
          basePath="/department-lead"
          viewId={view.id}
          finished={view.finished}
          showStatus={tab === "resolved"}
          trailingLabel="Assignee"
          selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
          trailing={(t) =>
            ASSIGNABLE.includes(tab) ? (
              <AssignMenu
                ticket={t}
                members={staff.members}
                membersLoading={staff.loading}
                membersError={staff.error}
                currentUserId={userId}
                assigning={pendingId === t.ticket_id}
                disabled={busy}
                onAssign={(person) => void assign(t, person)}
              />
            ) : (
              <AssigneeCell name={t.assignee_name} />
            )
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
              <EmptyState icon={Inbox} title={view.empty.title} description={withTeam(view.empty.description, team)} />
            )
          }
        />
      )}

      {!loading && !error && (
        <ListCaption className="-mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          {tickets.length > 0 && (
            <>
              <span>
                {plural(tickets.length, "ticket")} · {withTeam(view.description, team).toLowerCase()}
                {filters.active ? " (filtered)" : ""}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3 shrink-0" aria-hidden />
            Only {team} tickets are listed, enforced by the server.
          </span>
        </ListCaption>
      )}
    </div>
  );
}

/**
 * "3 selected | Assign | Set priority | Move department" (briefing p.55). Bulk actions are the
 * stretch goal N4 and Move is S12, so the buttons are shown but disabled until then.
 */
function BulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  const soon = (label: string, Icon: typeof SignalHigh, feature: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Button variant="ghost" size="sm" disabled className="h-9 text-background hover:bg-background/10 hover:text-background sm:h-8">
            <Icon data-icon="inline-start" aria-hidden />
            {label}
            {label === "Assign" && <ChevronDown data-icon="inline-end" aria-hidden />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Arrives with {feature}. Assign one ticket at a time from its row for now.</TooltipContent>
    </Tooltip>
  );

  return (
    <Card
      role="region"
      aria-label="Bulk actions"
      className="flex-row flex-wrap items-center gap-3 border-0 bg-foreground px-4 py-2.5 text-background shadow-sm ring-0 sm:px-5"
    >
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <Separator orientation="vertical" className="h-5 bg-background/20" />
      <div className="flex flex-wrap items-center gap-1">
        {soon("Assign", UserRoundPlus, "N4 (bulk actions)")}
        {soon("Set priority", SignalHigh, "N4 (bulk actions)")}
        {soon("Move department", Truck, "S12 (move between departments)")}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Bulk: stretch N4 · Move: S12
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-9 text-background hover:bg-background/10 hover:text-background sm:h-8"
        >
          <X data-icon="inline-start" aria-hidden />
          Clear
        </Button>
      </div>
    </Card>
  );
}
