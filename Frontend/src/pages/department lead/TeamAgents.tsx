import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, Gauge, Smile, UserCheck, Users, Zap } from "lucide-react";
import { getReportSummary, getWorkload } from "@/services/reports";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { useApiData } from "@/hooks/useApiData";
import { firstNameOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import LoadBar from "@/components/lead/LoadBar";
import { loadOf, minutesOrDash, pctOrDash, type WorkloadRowWithExtras } from "@/components/lead/reportFormat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const BASE = "/department-lead";

// Agent · Availability · Open · Waiting · Breached · Load · Resolved 7d · Avg 1st reply · CSAT.
// One grid for the header, the rows and the loading rows; below xl the rows stack as cards.
const ROW_GRID =
  "xl:grid xl:grid-cols-[minmax(0,1fr)_6.5rem_2.75rem_3.5rem_4rem_8rem_4.5rem_4.5rem_3rem] xl:items-center xl:gap-4";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const formatAverage = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const ticketsFor = (userId: string) => `${BASE}/all-tickets?tab=open&assignee=${encodeURIComponent(userId)}`;
const isAvailable = (row: WorkloadRowWithExtras) => row.available !== false;

/**
 * Team & workload (briefing p.17, p.57): only this department's agents, with what each person is
 * carrying, how fast they reply and how happy their requesters are. GET /api/reports/workload.
 */
export default function TeamAgents() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);

  const workload = useApiData(() => getWorkload({ days: 30 }), "team-workload");
  const summary = useApiData(() => getReportSummary({ days: 30 }), "team-summary");

  const stats = useMemo(() => {
    const rows = (workload.data?.agents ?? []) as WorkloadRowWithExtras[];
    // Agents by name, then the lead (if they carry tickets too): a roster, not a ranking
    const members = rows.filter((m) => m.role === "Agent" || loadOf(m) > 0).sort((a, b) => {
      const lead = Number(a.role !== "Agent") - Number(b.role !== "Agent");
      return lead || a.name.localeCompare(b.name);
    });
    const agents = members.filter((m) => m.role === "Agent");
    const available = agents.filter(isAvailable);
    const inHand = agents.reduce((sum, m) => sum + loadOf(m), 0);
    const average = agents.length ? inHand / agents.length : 0;
    const resolvedWeek = members.reduce((sum, m) => sum + m.resolved_7d, 0);

    // Rebalance hint (p.57): the busiest available agent is far above the team average and the quietest
    const byLoad = [...available].sort((a, b) => loadOf(b) - loadOf(a));
    const busiest = byLoad[0];
    const quietest = byLoad[byLoad.length - 1];
    const gap = busiest && quietest ? loadOf(busiest) - loadOf(quietest) : 0;
    const imbalance =
      busiest && quietest && busiest !== quietest && gap >= 4 && loadOf(busiest) >= average * 1.4 ? { busiest, quietest, move: Math.floor(gap / 2) } : null;

    return { members, agents, available, average, resolvedWeek, busiest: byLoad[0], imbalance };
  }, [workload.data]);

  const team = departmentName ?? summary.data?.department_name ?? null;
  const leadName = user ? `${user.name} ${user.surname ?? ""}`.trim() : "";
  const loading = workload.loading;
  const description =
    loading || workload.error
      ? "Who's on the team and how much each person is carrying"
      : [team, plural(stats.agents.length, "agent"), leadName && `lead ${leadName}`].filter(Boolean).join(" · ");
  const away = stats.agents.filter((a) => !isAvailable(a));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team & workload" description={description} />

      {workload.error && !workload.data ? (
        <ErrorState
          title="Couldn't load your team"
          description={workload.error.status === 0 ? undefined : workload.error.message}
          onRetry={workload.reload}
        />
      ) : (
        <>
          <section aria-label="Team summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Agents available"
              icon={UserCheck}
              loading={loading}
              value={`${stats.available.length} of ${stats.agents.length}`}
              hint={away.length ? `${away.map((a) => firstNameOf(a.name)).join(", ")} away` : stats.agents.length ? "Everyone is in" : "No agents yet"}
            />
            <StatCard
              label="Open per agent"
              icon={Gauge}
              loading={loading}
              value={stats.agents.length ? formatAverage(stats.average) : "—"}
              hint={
                stats.busiest && loadOf(stats.busiest) > 0
                  ? `Busiest: ${firstNameOf(stats.busiest.name)}, ${loadOf(stats.busiest)}`
                  : "Team average, open + waiting"
              }
            />
            <StatCard label="Resolved this week" icon={CircleCheck} loading={loading} value={stats.resolvedWeek} hint="Last 7 days" />
            <StatCard
              label="Team CSAT"
              icon={Smile}
              loading={summary.loading}
              value={summary.data ? pctOrDash(summary.data.csat_pct) : "—"}
              hint={
                summary.data
                  ? summary.data.csat_responses
                    ? `${plural(summary.data.csat_responses, "rating")}, last 30 days`
                    : "No ratings yet"
                  : "Couldn't load"
              }
            />
          </section>

          <div className="flex flex-col gap-3">
            <ListCard>
              <ListHeaderRow grid={ROW_GRID}>
                <span>Agent</span>
                <span>Availability</span>
                <span className="text-right">Open</span>
                <span className="text-right">Waiting</span>
                <span className="text-right">Breached</span>
                <span>Load</span>
                <span className="text-right">Resolved 7d</span>
                <span className="text-right">1st reply</span>
                <span className="text-right">CSAT</span>
              </ListHeaderRow>

              {loading ? (
                <LoadingRows
                  grid={ROW_GRID}
                  breakpoint="xl"
                  rows={4}
                  columns={["person", "badge", "meta", "meta", "meta", "text", "meta", "meta", "meta"]}
                />
              ) : stats.members.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No one on the team yet"
                  description="Agents appear here once a System Admin adds them to your department."
                />
              ) : (
                <ListBody>
                  {stats.members.map((m) => (
                    <MemberRow key={m.user_id} member={m} />
                  ))}
                </ListBody>
              )}
            </ListCard>

            {!loading && stats.members.length > 0 && (
              <ListCaption>
                Only members of {team ?? "your department"} are listed. Admins and other departments never appear here. Load is
                open + waiting on employee: amber at 8, rose at 10.
              </ListCaption>
            )}
          </div>

          {!loading && stats.imbalance && (
            <Alert className="flex flex-col gap-4 rounded-xl border-primary/20 bg-accent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Zap aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <AlertTitle className="font-semibold text-foreground">
                    {firstNameOf(stats.imbalance.busiest.name)} has {plural(loadOf(stats.imbalance.busiest), "ticket")}
                    {stats.imbalance.busiest.breached > 0 &&
                      ` and ${stats.imbalance.busiest.breached === 1 ? "one is" : `${stats.imbalance.busiest.breached} are`} breached`}
                    ; {firstNameOf(stats.imbalance.quietest.name)} has {loadOf(stats.imbalance.quietest) || "none"}.
                  </AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    Open All tickets filtered to {firstNameOf(stats.imbalance.busiest.name)} to reassign{" "}
                    {stats.imbalance.move === 1 ? "one" : stats.imbalance.move} of them.
                  </AlertDescription>
                </div>
              </div>
              <Button asChild variant="outline" className="ml-8 h-10 shrink-0 self-start bg-background sm:ml-0 sm:h-9 sm:self-auto">
                <Link to={ticketsFor(stats.imbalance.busiest.user_id)}>
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

function Availability({ member }: { member: WorkloadRowWithExtras }) {
  const available = isAvailable(member);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", available ? "text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", available ? "bg-success" : "bg-muted-foreground/50")} />
      {available ? "Available" : member.availability_note || "Away"}
    </span>
  );
}

function MemberRow({ member: m }: { member: WorkloadRowWithExtras }) {
  const load = loadOf(m);
  const role = m.role === "Department Lead" ? "Lead" : m.role;
  const breached = (
    <span className={cn("tabular-nums", m.breached > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>{m.breached}</span>
  );
  return (
    <ListRow grid={ROW_GRID} to={ticketsFor(m.user_id)} aria-label={`${m.name}: ${load} tickets in hand. Open their tickets.`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <UserAvatar name={m.name} description={role} />
        <span className="xl:hidden">
          <Availability member={m} />
        </span>
      </div>

      <span className="hidden xl:flex">
        <Availability member={m} />
      </span>

      {/* Phones and laptops: the numbers as one line, then the bar; wide screens: their own columns */}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums xl:hidden">
        <span>
          <span className="font-medium text-foreground">{m.open}</span> open
        </span>
        <span>
          <span className="font-medium text-foreground">{m.waiting}</span> waiting
        </span>
        <span>{breached} breached</span>
      </p>
      <span className="hidden text-right text-sm tabular-nums xl:block">{m.open}</span>
      <span className="hidden text-right text-sm tabular-nums xl:block">{m.waiting}</span>
      <span className="hidden text-right text-sm xl:block">{breached}</span>

      <LoadBar load={load} />

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums xl:hidden">
        <span>
          <span className="font-medium text-foreground">{m.resolved_7d}</span> resolved in 7 days
        </span>
        <span>
          <span className="font-medium text-foreground">{minutesOrDash(m.avg_first_response_mins)}</span> first reply
        </span>
        <span>
          <span className="font-medium text-foreground">{pctOrDash(m.csat_pct)}</span> CSAT
        </span>
      </p>
      <span className="hidden text-right text-sm tabular-nums xl:block">{m.resolved_7d}</span>
      <span className="hidden text-right text-sm tabular-nums xl:block">{minutesOrDash(m.avg_first_response_mins)}</span>
      <span className="hidden text-right text-sm tabular-nums xl:block">{pctOrDash(m.csat_pct)}</span>
    </ListRow>
  );
}

