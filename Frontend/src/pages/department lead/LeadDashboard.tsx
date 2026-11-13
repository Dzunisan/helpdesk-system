import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CircleCheck, ClipboardCheck, Layers, ShieldCheck, UserRoundX, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { useApiData } from "@/hooks/useApiData";
import { getBreaches, getDaily, getReportSummary, getWorkload } from "@/services/reports";
import { listApprovals } from "@/services/approvals";
import { formatDuration, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import CardLink from "@/components/app/CardLink";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { ListBody, ListRow } from "@/components/app/ListCard";
import ReportKpiTiles from "@/components/lead/ReportKpiTiles";
import ReportDaysSelect from "@/components/lead/ReportDaysSelect";
import RecentFeedback, { RECENT_FEEDBACK_ID } from "@/components/lead/RecentFeedback";
import { nextDue, type ReportDays, type SummaryWithExtras } from "@/components/lead/reportFormat";
import CreatedResolvedChart, { CreatedResolvedLegend } from "@/components/charts/CreatedResolvedChart";
import WorkloadBars, { WorkloadLegend } from "@/components/charts/WorkloadBars";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const BASE = "/department-lead";
const CATEGORIES_SHOWN = 5;
const CHART_DAYS = 14;

// Ref · title + requester · assignee · priority · clock. Below sm the row stacks.
const BREACH_GRID =
  "sm:grid sm:grid-cols-[4.25rem_minmax(0,1fr)_1.5rem_5.25rem_8.25rem] sm:items-center sm:gap-4";

/** A touch stronger than the default Skeleton so placeholders read on white cards */
const SK = "bg-foreground/[0.07]";

/**
 * Department Lead home (briefing p.17, p.54): what is late, what is unowned and who is overloaded.
 * Every number comes from GET /api/reports/* (the server forces the lead's own department).
 */
export default function LeadDashboard() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  const [days, setDays] = useState<ReportDays>(30);

  const summary = useApiData(() => getReportSummary({ days }) as Promise<SummaryWithExtras>, `summary-${days}`);
  const workload = useApiData(() => getWorkload({ days }), `workload-${days}`);
  const breaches = useApiData(() => getBreaches(), "breaches");
  const daily = useApiData(() => getDaily({ days: CHART_DAYS }), "daily");
  const oldestApproval = useApiData(() => listApprovals({ status: "pending", limit: 1 }), "approvals-oldest");

  const s = summary.data;
  const team = departmentName ?? s?.department_name ?? null;
  const description = [team, formatSast(new Date(), "long")].filter(Boolean).join(" · ");
  const topCategories = s?.top_categories ?? null;

  const pendingCount = s?.pending_approvals ?? oldestApproval.data?.pagination.total ?? 0;
  const oldest = oldestApproval.data?.approvals[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard" description={description} actions={<ReportDaysSelect value={days} onValueChange={setDays} />} />

      {summary.error && !s ? (
        <ErrorState title="Couldn't load the department numbers" description={summary.error.message} onRetry={summary.reload} />
      ) : (
        <ReportKpiTiles summary={s} loading={summary.loading} linkBase={BASE} csatTo={`#${RECENT_FEEDBACK_ID}`} />
      )}

      {/* Phones: what is waiting on the lead comes straight after the numbers */}
      {pendingCount > 0 && <ApprovalCallout count={pendingCount} oldest={oldest} className="lg:hidden" />}

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <SectionCard
            title="Breached & due soon"
            description="Overdue first, then the nearest due time"
            action={<CardLink to={`${BASE}/all-tickets?tab=breached`}>View all</CardLink>}
            flush
          >
            {breaches.loading ? (
              <BreachSkeleton />
            ) : breaches.error && !breaches.data ? (
              <div className="p-6">
                <ErrorState stacked title="Couldn't load breached tickets" onRetry={breaches.reload} />
              </div>
            ) : (breaches.data?.tickets.length ?? 0) === 0 ? (
              <EmptyState
                size="compact"
                icon={ShieldCheck}
                title="Nothing breached or due soon"
                description={`Every ${team ?? "department"} ticket is inside its targets.`}
              />
            ) : (
              <ListBody>
                {breaches.data!.tickets.map((t) => (
                  <BreachRow key={t.ticket_id} ticket={t} />
                ))}
              </ListBody>
            )}
          </SectionCard>

          <SectionCard
            title="Created vs resolved"
            description={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                Last {CHART_DAYS} days
                <CreatedResolvedLegend />
              </span>
            }
            contentClassName="flex flex-col"
          >
            {daily.loading ? (
              <Skeleton className={cn(SK, "h-56 w-full rounded-lg")} />
            ) : daily.error && !daily.data ? (
              <ErrorState stacked title="Couldn't load the chart" onRetry={daily.reload} />
            ) : daily.data!.days.every((d) => d.created === 0 && d.resolved === 0) ? (
              <EmptyState
                size="compact"
                icon={BarChart3}
                title="A quiet fortnight"
                description={`No ${team ?? ""} requests were created or resolved in the last ${CHART_DAYS} days.`}
              />
            ) : (
              <>
                <CreatedResolvedChart days={daily.data!.days} />
                <p className="pt-3 text-xs text-muted-foreground tabular-nums">
                  {daily.data!.days.reduce((n, d) => n + d.created, 0)} created ·{" "}
                  {daily.data!.days.reduce((n, d) => n + d.resolved, 0)} resolved in {CHART_DAYS} days
                </p>
              </>
            )}
          </SectionCard>

          {/* S10: the CSAT tile scrolls here (p.19 step 6, p.54) */}
          <RecentFeedback days={days} ticketBase={BASE} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <SectionCard
            title="Agent workload"
            description={<WorkloadLegend className="pt-1" />}
            action={<CardLink to={`${BASE}/team`}>Team</CardLink>}
          >
            {workload.loading ? (
              <WorkloadSkeleton />
            ) : workload.error && !workload.data ? (
              <ErrorState stacked title="Couldn't load the workload" onRetry={workload.reload} />
            ) : workload.data!.agents.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Users}
                title="No agents yet"
                description="Ask your System Admin to add agents to your department."
                className="py-4"
              />
            ) : (
              <WorkloadBars
                agents={workload.data!.agents.filter((a) => a.role === "Agent" || a.open + a.waiting > 0)}
                rowLink={(a) => `${BASE}/all-tickets?tab=open&assignee=${encodeURIComponent(a.user_id)}`}
              />
            )}
          </SectionCard>

          {s && pendingCount > 0 ? (
            <ApprovalCallout count={pendingCount} oldest={oldest} className="hidden lg:flex" />
          ) : (
            s && (
              <div className="hidden items-center gap-3 rounded-xl border border-border px-5 py-4 text-sm text-muted-foreground lg:flex">
                <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                No requests are waiting for your approval.
              </div>
            )
          )}

          <SectionCard title="Top categories" description={`Requests created in the last ${days} days`}>
            {!topCategories && summary.loading ? (
              <CategorySkeleton />
            ) : !topCategories ? (
              <ErrorState stacked title="Couldn't load categories" onRetry={summary.reload} />
            ) : topCategories.length === 0 ? (
              <EmptyState
                size="compact"
                icon={Layers}
                title="No new requests"
                description={`Nothing was logged in the last ${days} days.`}
                className="py-4"
              />
            ) : (
              <ul role="list" className="flex flex-col gap-4">
                {topCategories.slice(0, CATEGORIES_SHOWN).map((c) => (
                  <li key={c.category_name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
                    <span className="truncate text-sm text-foreground">{c.category_name}</span>
                    <span className="text-sm font-medium text-foreground tabular-nums">{c.count}</span>
                    <Progress
                      value={(c.count / topCategories[0].count) * 100}
                      aria-label={`${c.category_name}: ${c.count} requests`}
                      className="col-span-2 h-1.5"
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
function ApprovalCallout({
  count,
  oldest,
  className,
}: {
  count: number;
  oldest?: { ticket: Ticket; waiting_mins: number };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-pending-border bg-pending-muted p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-pending text-primary-foreground">
          <ClipboardCheck className="size-4.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-pending-strong">
            {count === 1 ? "1 request is waiting for your approval" : `${count} requests are waiting for your approval`}
          </p>
          {oldest && (
            <p className="line-clamp-2 text-xs text-pending tabular-nums">
              Oldest: {oldest.ticket.title}, {formatDuration(oldest.waiting_mins)}
            </p>
          )}
        </div>
      </div>
      <Button asChild variant="outline" className="ml-12 h-10 shrink-0 self-start bg-background sm:ml-0 sm:h-9 sm:self-auto">
        <Link to={`${BASE}/approvals`}>
          Review
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}

/** One overdue or due-soon ticket: ref · title + requester · assignee · priority · clock */
function BreachRow({ ticket: t }: { ticket: Ticket }) {
  const assigneeName = t.assignee_id ? t.assignee_name || "Assigned" : "Unassigned";
  const clock = <SlaChip due={nextDue(t)} start={t.created_at} />;
  return (
    <ListRow to={`${BASE}/tickets/${t.ticket_id}`} grid={BREACH_GRID} className="py-4" aria-label={`Open HD-${t.ticket_id}: ${t.title}`}>
      <TicketRef id={t.ticket_id} className="hidden sm:block" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          <TicketRef id={t.ticket_id} />
          <PriorityBadge priority={t.ticket_priority} />
          {clock}
        </div>
        <span className="line-clamp-2 text-sm font-medium text-foreground">{t.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {t.requester_name ?? "Employee"}
          <span className="sm:hidden"> · {assigneeName}</span>
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="hidden sm:flex" aria-label={`Assignee: ${assigneeName}`}>
            {t.assignee_id ? (
              <UserAvatar name={t.assignee_name} size="sm" />
            ) : (
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <UserRoundX className="size-3.5" aria-hidden />
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>{assigneeName}</TooltipContent>
      </Tooltip>
      <div className="hidden sm:flex">
        <PriorityBadge priority={t.ticket_priority} />
      </div>
      <div className="hidden justify-end sm:flex">{clock}</div>
    </ListRow>
  );
}

function BreachSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className={cn("flex flex-col gap-3 px-6 py-4", BREACH_GRID)}>
          <Skeleton className={cn(SK, "hidden h-3 w-14 sm:block")} />
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className={cn(SK, "h-4", ["w-3/4", "w-2/3", "w-1/2", "w-3/5"][i])} />
            <Skeleton className={cn(SK, "h-3 w-28")} />
          </div>
          <Skeleton className={cn(SK, "hidden size-6 rounded-full sm:block")} />
          <Skeleton className={cn(SK, "hidden h-5 w-14 rounded-full sm:block")} />
          <Skeleton className={cn(SK, "hidden h-5 w-24 justify-self-end rounded-full sm:block")} />
        </li>
      ))}
    </ul>
  );
}

function WorkloadSkeleton() {
  return (
    <div className="flex flex-col gap-5 py-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid grid-cols-[9.5rem_minmax(0,1fr)_1.5rem] items-center gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className={cn(SK, "size-6 shrink-0 rounded-full")} />
            <Skeleton className={cn(SK, "h-3.5 w-24")} />
          </div>
          <Skeleton className={cn(SK, "h-2 w-full rounded-full")} />
          <Skeleton className={cn(SK, "h-3.5 w-4")} />
        </div>
      ))}
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-4 gap-y-2">
          <Skeleton className={cn(SK, "h-3.5", ["w-40", "w-32", "w-36", "w-28"][i])} />
          <Skeleton className={cn(SK, "h-3.5 w-5 justify-self-end")} />
          <Skeleton className={cn(SK, "col-span-2 h-1.5 w-full rounded-full")} />
        </div>
      ))}
    </div>
  );
}
