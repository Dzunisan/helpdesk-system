import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, Gauge, UserCheck, UserRoundX, Users, Zap } from "lucide-react";
import { fetchAgents } from "@/services/ticketService";
import { fetchAllTickets } from "@/components/lead/fetchAllTickets";
import type { AgentUser, Ticket } from "@/types/ticket.types";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow } from "@/components/app/ListCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// One grid for the header, the rows and the loading rows. Below lg the rows stack.
// Fixed side tracks (a growable track would starve the name column on laptops).
const ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_5.5rem_8rem] lg:items-center lg:gap-5 xl:grid-cols-[minmax(0,1fr)_7rem_4rem_6rem_14rem] xl:gap-6";

/** A full load bar: this many open tickets on one person (briefing p.57: rose at 10+) */
const LOAD_FULL = 10;
const WEEK_MS = 7 * 86_400_000;

/** Statuses where the work is still with the team */
const WORKING = new Set(["open", "in progress"]);
const DONE = new Set(["resolved", "closed"]);
const statusOf = (t: Ticket) => t.ticket_status.trim().toLowerCase();

interface MemberLoad {
  agent: AgentUser;
  name: string;
  open: number;
  resolvedWeek: number;
}

const fullName = (a: AgentUser) => `${a.name} ${a.surname ?? ""}`.trim();
const roleLabel = (role: string) => (role === "Department Lead" ? "Lead" : role);
const formatAverage = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function LoadBar({ open }: { open: number }) {
  return (
    <Progress
      value={Math.min(open / LOAD_FULL, 1) * 100}
      aria-label={`Load: ${open} open of ${LOAD_FULL}`}
      className={cn("h-1.5", open >= LOAD_FULL && "[&>[data-slot=progress-indicator]]:bg-destructive")}
    />
  );
}

/** Placeholder rows shaped like member rows: two-line avatar, role pill, two numbers, a bar */
function MemberSkeletonRows({ rows = 4 }: { rows?: number }) {
  const sk = "bg-foreground/[0.07]";
  return (
    <ListBody>
      {Array.from({ length: rows }, (_, i) => (
        <ListRow key={i} grid={ROW_GRID}>
          <div className="flex items-center gap-2.5">
            <Skeleton className={cn(sk, "size-8 shrink-0 rounded-full")} />
            <div className="flex flex-col gap-1.5">
              <Skeleton className={cn(sk, "h-3.5 w-28")} />
              <Skeleton className={cn(sk, "h-3 w-40")} />
            </div>
          </div>
          <Skeleton className={cn(sk, "hidden h-5 w-14 rounded-full lg:block")} />
          <Skeleton className={cn(sk, "h-3.5 w-24 lg:ml-auto lg:w-5")} />
          <Skeleton className={cn(sk, "hidden h-3.5 w-5 lg:ml-auto lg:block")} />
          <Skeleton className={cn(sk, "h-1.5 w-full rounded-full")} />
        </ListRow>
      ))}
    </ListBody>
  );
}

export default function TeamAgents() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  const myId = String(user?.user_id ?? user?.id ?? "");

  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** When the data arrived: "this week" is counted back from here */
  const [loadedAt, setLoadedAt] = useState(0);

  // Bumped by Try again; the effect below does the fetching (state only changes once it settles)
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAgents(), fetchAllTickets()])
      .then(([list, all]) => {
        if (cancelled) return;
        setAgents(list);
        setTickets(all);
        setLoadedAt(Date.now());
        setError(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load the team:", err);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const load = () => {
    setLoading(true);
    setError(false);
    setReloadKey((k) => k + 1);
  };

  const stats = useMemo(() => {
    const weekAgo = loadedAt - WEEK_MS;
    const members: MemberLoad[] = agents.map((agent) => {
      const mine = tickets.filter((t) => t.assignee_id != null && String(t.assignee_id) === String(agent.user_id));
      return {
        agent,
        name: fullName(agent),
        open: mine.filter((t) => WORKING.has(statusOf(t))).length,
        resolvedWeek: mine.filter(
          (t) => DONE.has(statusOf(t)) && new Date(t.updated_at ?? t.created_at).getTime() >= weekAgo,
        ).length,
      };
    });
    // Lead last, agents by name: a stable roster rather than a ranking
    members.sort((a, b) => {
      const lead = Number(a.agent.role === "Department Lead") - Number(b.agent.role === "Department Lead");
      return lead || a.name.localeCompare(b.name);
    });

    const agentsOnly = members.filter((m) => m.agent.role === "Agent");
    const assignedOpen = agentsOnly.reduce((sum, m) => sum + m.open, 0);
    const average = agentsOnly.length ? assignedOpen / agentsOnly.length : 0;
    const unassigned = tickets.filter((t) => statusOf(t) === "open" && !t.assignee_id).length;
    const resolvedWeek = members.reduce((sum, m) => sum + m.resolvedWeek, 0);

    // Rebalance hint (p.57): the busiest agent carries at least double the average and 3+ more than the quietest
    const byLoad = [...agentsOnly].sort((a, b) => b.open - a.open);
    const busiest = byLoad[0];
    const quietest = byLoad[byLoad.length - 1];
    const imbalance =
      busiest && quietest && busiest !== quietest && busiest.open >= average * 2 && busiest.open - quietest.open >= 3
        ? { busiest, quietest }
        : null;

    return { members, agentsOnly, average, unassigned, resolvedWeek, busiest, imbalance };
  }, [agents, tickets, loadedAt]);

  const team = departmentName ?? agents[0]?.department_name ?? null;
  const leadName = user ? `${user.name} ${user.surname ?? ""}`.trim() : "";
  const description = loading || error
    ? "Who's on the team and how much each person is carrying."
    : [team, `${stats.agentsOnly.length} ${stats.agentsOnly.length === 1 ? "agent" : "agents"}`, leadName && `lead ${leadName}`]
        .filter(Boolean)
        .join(" · ");

  const firstOf = (name: string) => name.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team & workload" description={description} />

      {error && !loading ? (
        <ErrorState title="Couldn't load your team" onRetry={load} />
      ) : (
        <>
          <section aria-label="Team summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Agents"
              icon={Users}
              loading={loading}
              value={stats.agentsOnly.length}
              hint={stats.members.length > stats.agentsOnly.length ? "Plus you as lead" : "In your team"}
            />
            <StatCard
              label="Open per agent"
              icon={Gauge}
              loading={loading}
              value={stats.agentsOnly.length ? formatAverage(stats.average) : "—"}
              hint={stats.busiest && stats.busiest.open > 0 ? `Busiest: ${firstOf(stats.busiest.name)}, ${stats.busiest.open}` : "Team average"}
            />
            <StatCard
              label="Unassigned"
              icon={UserRoundX}
              loading={loading}
              value={stats.unassigned}
              hint={stats.unassigned ? "Waiting in the queue" : "Queue clear"}
              to="/department-lead/ticket-queue"
            />
            <StatCard
              label="Resolved"
              icon={CircleCheck}
              loading={loading}
              value={stats.resolvedWeek}
              hint="Last 7 days"
            />
          </section>

          <div className="flex flex-col gap-3">
            <ListCard>
              <ListHeaderRow grid={ROW_GRID}>
                <span>Member</span>
                <span>Role</span>
                <span className="text-right">Open</span>
                <span className="text-right">Resolved 7d</span>
                <span>Load</span>
              </ListHeaderRow>

              {loading ? (
                <MemberSkeletonRows />
              ) : stats.members.length === 0 ? (
                <EmptyState
                  icon={UserCheck}
                  title="No one on the team yet"
                  description="Agents appear here once a system admin adds them to your department."
                />
              ) : (
                <ListBody>
                  {stats.members.map((m) => {
                    const isMe = String(m.agent.user_id) === myId;
                    return (
                      <ListRow key={m.agent.user_id} grid={ROW_GRID}>
                        <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
                          <UserAvatar name={m.name} description={m.agent.email} />
                          <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground lg:hidden">
                            {roleLabel(m.agent.role)}
                            {isMe && " · you"}
                          </Badge>
                        </div>

                        <div className="hidden lg:block">
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            {roleLabel(m.agent.role)}
                            {isMe && " · you"}
                          </Badge>
                        </div>

                        {/* Phone: open + resolved as a compact line; desktop: their own columns */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums lg:contents lg:text-sm lg:text-foreground">
                          <span className="lg:text-right">
                            <span className="font-medium text-foreground lg:font-normal">{m.open}</span>
                            <span className="lg:hidden"> open</span>
                          </span>
                          <span className="lg:text-right">
                            <span className="font-medium text-foreground lg:font-normal">{m.resolvedWeek}</span>
                            <span className="lg:hidden"> resolved this week</span>
                          </span>
                        </div>

                        <LoadBar open={m.open} />
                      </ListRow>
                    );
                  })}
                </ListBody>
              )}
            </ListCard>

            {!loading && stats.members.length > 0 && (
              <ListCaption>
                Only active members of {team ?? "your department"} are listed. Open counts tickets assigned and not yet
                resolved; a bar is full at {LOAD_FULL}.
              </ListCaption>
            )}
          </div>

          {!loading && stats.imbalance && (
            <Alert className="flex flex-col gap-4 rounded-xl border-primary/20 bg-accent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Zap aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <AlertTitle className="font-semibold text-foreground">
                    {firstOf(stats.imbalance.busiest.name)} has {stats.imbalance.busiest.open} open tickets;{" "}
                    {firstOf(stats.imbalance.quietest.name)} has{" "}
                    {stats.imbalance.quietest.open === 0 ? "none" : stats.imbalance.quietest.open}.
                  </AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    Open All tickets to reassign some of {firstOf(stats.imbalance.busiest.name)}'s work.
                  </AlertDescription>
                </div>
              </div>
              <Button asChild variant="outline" className="ml-8 shrink-0 self-start bg-background sm:ml-0 sm:self-auto">
                <Link to="/department-lead/ticket-queue">
                  Rebalance
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
