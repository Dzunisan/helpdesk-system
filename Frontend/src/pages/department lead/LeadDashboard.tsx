import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, ClipboardCheck, Hourglass, Inbox, Layers, UserRoundX, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { listAllTickets, listAssignees } from "@/services/tickets";
import { formatAge, formatSast, formatTicketRef } from "@/lib/format";
import { toPriority, toStatus } from "@/lib/ticketVocabulary";
import { cn } from "@/lib/utils";
import type { Assignee as AgentUser, Ticket } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import CardLink from "@/components/app/CardLink";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { ListBody, ListRow } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { byUrgency, plural } from "@/components/queue/queueUtils";

const BASE = "/department-lead";
const URGENT_SHOWN = 5;
const CATEGORIES_SHOWN = 5;
const DAY_MS = 86_400_000;
/** A full workload bar: this many open tickets on one person (same scale as Team & workload) */
const LOAD_FULL = 10;

/** Still with the team: new, open, waiting (pending approval sits with the lead, not the team) */
const isBacklog = (t: Ticket) => ["new", "open", "waiting"].includes(toStatus(t.ticket_status));
const isHigh = (t: Ticket) => ["urgent", "high"].includes(toPriority(t.ticket_priority));
const isPending = (t: Ticket) => toStatus(t.ticket_status) === "pending";
const isFinished = (t: Ticket) => ["resolved", "closed"].includes(toStatus(t.ticket_status));
const created = (t: Ticket) => new Date(t.created_at).getTime() || 0;
const oldestFirst = (a: Ticket, b: Ticket) => created(a) - created(b);
const fullName = (a: AgentUser) => `${a.name} ${a.surname ?? ""}`.trim();

// Ref · title + meta · assignee · priority. Below sm the row stacks.
const URGENT_GRID = "sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_1.5rem_5.5rem] sm:items-center sm:gap-4";

/** Department Lead home: the state of the department at a glance (briefing p.54) */
export default function LeadDashboard() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  /** When the data arrived: "last 7 days" and ages count back from here */
  const [loadedAt, setLoadedAt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllTickets(), listAssignees()])
      .then(([all, team]) => {
        if (cancelled) return;
        setTickets(all);
        setAgents(team);
        setLoadedAt(Date.now());
        setError(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load the dashboard:", err);
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRetrying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setRetrying(true);
    setReloadKey((k) => k + 1);
  };

  const stats = useMemo(() => {
    const backlog = tickets.filter(isBacklog).sort(byUrgency);
    const unassigned = backlog.filter((t) => !t.assignee_id);
    const pending = tickets.filter(isPending).sort(oldestFirst);
    const weekAgo = loadedAt - 7 * DAY_MS;
    const resolvedWeek = tickets.filter(
      (t) => isFinished(t) && new Date(t.updated_at ?? t.created_at).getTime() >= weekAgo,
    ).length;

    // Workload: open tickets per agent, busiest first
    const workload = agents
      .filter((a) => a.role === "Agent")
      .map((agent) => ({
        agent,
        name: fullName(agent),
        open: backlog.filter((t) => t.assignee_id != null && String(t.assignee_id) === String(agent.user_id)).length,
      }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

    // Top categories among requests created in the last 30 days
    const monthAgo = loadedAt - 30 * DAY_MS;
    const byCategory = new Map<string, number>();
    for (const t of tickets) {
      if (created(t) < monthAgo) continue;
      const name = t.category_name?.trim() || "Uncategorised";
      byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
    }
    const categories = [...byCategory.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      backlog,
      unassigned,
      oldestUnassigned: [...unassigned].sort(oldestFirst)[0],
      oldestOpen: [...backlog].sort(oldestFirst)[0],
      highBacklog: backlog.filter(isHigh).length,
      highUnassigned: unassigned.filter(isHigh).length,
      pending,
      resolvedWeek,
      workload,
      categories,
    };
  }, [tickets, agents, loadedAt]);

  const team = departmentName ?? tickets.find((t) => t.department_name)?.department_name ?? null;
  const description = [team, formatSast(new Date(), "long")].filter(Boolean).join(" · ");

  if (error && !loading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Dashboard" description={description} />
        <ErrorState title="Couldn't load your dashboard" onRetry={retry} retrying={retrying} />
      </div>
    );
  }

  const oldestPending = stats.pending[0];
  const maxCategory = stats.categories[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" description={description} />

      <section aria-label="Department summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Open backlog"
          icon={Inbox}
          loading={loading}
          value={stats.backlog.length}
          hint={stats.highBacklog ? `${stats.highBacklog} high priority` : "Nothing high priority"}
          to={`${BASE}/all-tickets`}
        />
        <StatCard
          label="Unassigned"
          icon={UserRoundX}
          loading={loading}
          value={stats.unassigned.length}
          tone={stats.highUnassigned > 0 ? "warning" : "default"}
          hint={stats.oldestUnassigned ? `Oldest ${formatAge(stats.oldestUnassigned.created_at)}` : "Queue clear"}
          to={`${BASE}/all-tickets`}
        />
        <StatCard
          label="Oldest open"
          icon={Hourglass}
          loading={loading}
          value={stats.oldestOpen ? formatAge(stats.oldestOpen.created_at) : "—"}
          hint={
            stats.oldestOpen ? `${formatTicketRef(stats.oldestOpen.ticket_id)} · ${stats.oldestOpen.title}` : "Nothing open"
          }
          to={stats.oldestOpen ? `${BASE}/tickets/${stats.oldestOpen.ticket_id}` : undefined}
        />
        <StatCard
          label="Resolved"
          icon={CircleCheck}
          loading={loading}
          value={stats.resolvedWeek}
          hint="Last 7 days"
        />
      </section>

      {/* Phones: the one thing waiting on the lead comes straight after the numbers */}
      {!loading && oldestPending && (
        <ApprovalCallout count={stats.pending.length} oldest={oldestPending} className="lg:hidden" />
      )}

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <SectionCard
            title="Most urgent"
            description={
              loading || stats.backlog.length === 0
                ? "Open tickets, highest priority first, then oldest"
                : `${plural(stats.backlog.length, "open ticket")} · highest priority first, then oldest`
            }
            action={<CardLink to={`${BASE}/all-tickets`}>All tickets</CardLink>}
            flush
          >
            {loading ? (
              <RowSkeleton rows={URGENT_SHOWN} />
            ) : stats.backlog.length === 0 ? (
              <EmptyState
                size="compact"
                icon={CircleCheck}
                title="Nothing open"
                description={`Every ${team ?? "department"} ticket is resolved or waiting for approval.`}
              />
            ) : (
              <ListBody>
                {stats.backlog.slice(0, URGENT_SHOWN).map((t) => (
                  <UrgentRow key={t.ticket_id} ticket={t} />
                ))}
              </ListBody>
            )}
            {!loading && stats.backlog.length > URGENT_SHOWN && (
              <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground tabular-nums">
                Showing {URGENT_SHOWN} of {stats.backlog.length}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Top categories" description="Requests created in the last 30 days">
            {loading ? (
              <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-4 gap-y-2">
                    <Skeleton className={cn(SK, "h-3.5", ["w-40", "w-32", "w-36", "w-28"][i])} />
                    <Skeleton className={cn(SK, "h-3.5 w-5 justify-self-end")} />
                    <Skeleton className={cn(SK, "col-span-2 h-1.5 w-full rounded-full")} />
                  </div>
                ))}
              </div>
            ) : stats.categories.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Layers}
                title="No new requests"
                description="Nothing was logged in the last 30 days."
                className="py-4"
              />
            ) : (
              <ul role="list" className="flex flex-col gap-4">
                {stats.categories.slice(0, CATEGORIES_SHOWN).map((c) => (
                  <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
                    <span className="truncate text-sm text-foreground">{c.name}</span>
                    <span className="text-sm font-medium text-foreground tabular-nums">{c.count}</span>
                    <Progress
                      value={(c.count / maxCategory) * 100}
                      aria-label={`${c.name}: ${plural(c.count, "request")}`}
                      className="col-span-2 h-1.5"
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {!loading && oldestPending && (
            <ApprovalCallout count={stats.pending.length} oldest={oldestPending} className="hidden lg:flex" />
          )}

          <SectionCard
            title="Agent workload"
            description="Open tickets per agent"
            action={<CardLink to={`${BASE}/team`}>Team</CardLink>}
          >
            {loading ? (
              <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className={cn(SK, "size-6 shrink-0 rounded-full")} />
                      <Skeleton className={cn(SK, "h-3.5 w-28")} />
                    </div>
                    <Skeleton className={cn(SK, "h-1.5 w-full rounded-full")} />
                  </div>
                ))}
              </div>
            ) : stats.workload.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Users}
                title="No agents yet"
                description="Ask your System Admin to add agents to your department."
                className="py-4"
              />
            ) : (
              <ul role="list" className="flex flex-col gap-5">
                {stats.workload.map((m) => (
                  <li key={m.agent.user_id} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <UserAvatar name={m.name} size="sm" showName />
                      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                        <span className="font-medium text-foreground">{m.open}</span> open
                      </span>
                    </div>
                    <Progress
                      value={Math.min(m.open / LOAD_FULL, 1) * 100}
                      aria-label={`${m.name}: ${m.open} open of ${LOAD_FULL}`}
                      className={cn("h-1.5", m.open >= LOAD_FULL && "[&>[data-slot=progress-indicator]]:bg-destructive")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** "3 requests are waiting for your approval" with a Review button (p.54) */
function ApprovalCallout({ count, oldest, className }: { count: number; oldest: Ticket; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardCheck className="size-4.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">
            {count === 1 ? "1 request is waiting for your approval" : `${count} requests are waiting for your approval`}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Oldest: <span className="text-foreground/80">{oldest.title}</span>, waiting {formatAge(oldest.created_at)}
          </p>
        </div>
      </div>
      <Button asChild variant="outline" className="ml-12 h-10 self-start bg-background sm:h-9">
        <Link to={`${BASE}/approvals`}>
          Review requests
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}

/** One open ticket: ref · title with requester and age · assignee · priority */
function UrgentRow({ ticket }: { ticket: Ticket }) {
  const meta = [ticket.requester_name, `${formatAge(ticket.created_at)} old`].filter(Boolean).join(" · ");
  const assigneeName = ticket.assignee_id ? ticket.assignee_name || "Assigned" : "Unassigned";
  return (
    <ListRow to={`${BASE}/tickets/${ticket.ticket_id}`} grid={URGENT_GRID} className="py-4">
      <TicketRef id={ticket.ticket_id} className="hidden sm:block" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2 sm:hidden">
          <TicketRef id={ticket.ticket_id} />
          <PriorityBadge priority={ticket.ticket_priority} />
        </div>
        <span className="line-clamp-2 text-sm font-medium text-foreground sm:truncate">{ticket.title}</span>
        <span className="truncate text-xs text-muted-foreground tabular-nums">{meta}</span>
      </div>
      {/* Phones: the name on its own line. Wider: just the avatar, named in a tooltip. */}
      <div className="min-w-0 sm:hidden">
        {ticket.assignee_id ? (
          <UserAvatar name={ticket.assignee_name} size="sm" showName nameClassName="text-xs" />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRoundX className="size-4 shrink-0" aria-hidden />
            Unassigned
          </span>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="hidden sm:flex" aria-label={`Assignee: ${assigneeName}`}>
            {ticket.assignee_id ? (
              <UserAvatar name={ticket.assignee_name} size="sm" />
            ) : (
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <UserRoundX className="size-3.5" aria-hidden />
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>{assigneeName}</TooltipContent>
      </Tooltip>
      <div className="hidden justify-end sm:flex">
        <PriorityBadge priority={ticket.ticket_priority} />
      </div>
    </ListRow>
  );
}

/** A touch stronger than the default Skeleton so placeholders read on white cards */
const SK = "bg-foreground/[0.07]";

function RowSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={cn("flex flex-col gap-3 px-6 py-4", URGENT_GRID)}>
          <Skeleton className={cn(SK, "hidden h-3 w-14 sm:block")} />
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className={cn(SK, "h-4", ["w-3/4", "w-2/3", "w-1/2", "w-3/5", "w-2/5"][i % 5])} />
            <Skeleton className={cn(SK, "h-3 w-32")} />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className={cn(SK, "size-6 shrink-0 rounded-full")} />
            <Skeleton className={cn(SK, "h-3.5 w-20 sm:hidden")} />
          </div>
          <Skeleton className={cn(SK, "hidden h-5 w-14 justify-self-end rounded-full sm:block")} />
        </li>
      ))}
    </ul>
  );
}
