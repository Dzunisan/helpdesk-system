import { useMemo, useState, type ReactNode } from "react";
import { AlarmClock, CalendarClock, CircleCheck, Hourglass, Inbox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { formatAge, formatSast, formatTicketRef } from "@/lib/format";
import type { Ticket } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import CardLink from "@/components/app/CardLink";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import { ListBody, ListRow, ListRowLink } from "@/components/app/ListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ClaimButton, ClaimNextButton } from "@/components/queue/ClaimButton";
import { formatTarget, minutesBetween, nextDueMs, rowClock } from "@/components/queue/ticketSla";
import { useClaim, useClaimNextShortcut } from "@/components/queue/useClaim";
import { useTicketList } from "@/components/queue/useTicketList";
import { AGENT_VIEWS, agentQueuePath, type TicketLinkState } from "@/components/queue/queueViews";
import { plural, sastDayKey } from "@/components/queue/queueUtils";

const BASE = "/agent";
const MY_TICKETS_SHOWN = 6;
const QUEUE_SHOWN = 4;
const WEEK_MS = 7 * 86_400_000;

/** "Good morning" / "Good afternoon" / "Good evening", by the hour in SAST */
function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Johannesburg" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const resolvedThisWeek = (t: Ticket, now: number) => !!t.resolved_at && now - new Date(t.resolved_at).getTime() <= WEEK_MS;

/** Agent home, "start of shift" (briefing p.46) */
export default function AgentDashboard() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id ?? undefined);
  const team = departmentName ?? "your department";

  const mine = useTicketList(AGENT_VIEWS["my-open"].params);
  const queue = useTicketList(AGENT_VIEWS.unassigned.params);
  const week = useTicketList(AGENT_VIEWS.resolved.params, { filter: resolvedThisWeek });

  const { claim, pendingId, busy } = useClaim({
    basePath: BASE,
    onDone: () => {
      void mine.refresh();
      void queue.refresh();
    },
    onConflict: () => void queue.refresh(),
  });

  // "Now" when the lists arrived; the SLA chips keep their own clock
  const [openedAt] = useState(() => Date.now());
  const kpis = useMemo(() => {
    const today = sastDayKey(openedAt);
    const waiting = mine.tickets.filter((t) => t.ticket_status === "Waiting on employee");
    const oldestWaiting = [...waiting].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))[0];
    const breached = mine.tickets.filter((t) => t.sla_state === "breached");
    const dueToday = mine.tickets
      .map((t) => ({ t, due: nextDueMs(t) }))
      .filter(({ t, due }) => due !== null && due >= openedAt && sastDayKey(due) === today && t.sla_state !== "breached")
      .sort((a, b) => a.due! - b.due!);
    return { waiting, oldestWaiting, breached, dueToday };
  }, [mine.tickets, openedAt]);

  const lastWeek = useMemo(() => {
    const replied = week.tickets.filter((t) => t.first_response_at);
    const avg = replied.length
      ? replied.reduce((sum, t) => sum + minutesBetween(t.created_at, t.first_response_at!), 0) / replied.length
      : null;
    return { resolved: week.tickets.length, avgFirstReply: avg };
  }, [week.tickets]);

  const next = queue.tickets[0];
  const claimNext = () => {
    if (next && !busy) void claim(next);
  };
  useClaimNextShortcut(claimNext, !!next && !busy && !queue.loading);

  const firstName = user?.name?.trim() || "there";
  const failed = (hint: ReactNode) => (mine.error ? "Couldn't load" : hint);
  const firstBreach = kpis.breached[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={[formatSast(new Date(), "long"), departmentName].filter(Boolean).join(" · ")}
        actions={<ClaimNextButton onClick={claimNext} disabled={!next || queue.loading} busy={busy && pendingId === next?.ticket_id} />}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="My open"
          icon={Inbox}
          loading={mine.loading}
          value={mine.error ? "—" : mine.total}
          hint={failed(`${kpis.dueToday.length} due today`)}
          to={agentQueuePath("my-open")}
        />
        <StatCard
          label="Waiting on employee"
          icon={Hourglass}
          loading={mine.loading}
          value={mine.error ? "—" : kpis.waiting.length}
          hint={failed(kpis.oldestWaiting ? `Oldest ${formatAge(kpis.oldestWaiting.updated_at)}` : "Nobody owes you a reply")}
          to={agentQueuePath("waiting")}
        />
        <StatCard
          label="Due today"
          icon={CalendarClock}
          loading={mine.loading}
          value={mine.error ? "—" : kpis.dueToday.length}
          tone={!mine.error && kpis.dueToday.length > 0 ? "warning" : "default"}
          hint={failed(kpis.dueToday[0] ? `Next at ${formatSast(kpis.dueToday[0].due!, "time")}` : "Nothing else due today")}
          to={agentQueuePath("my-open")}
        />
        <StatCard
          label="Breached"
          icon={AlarmClock}
          loading={mine.loading}
          value={mine.error ? "—" : kpis.breached.length}
          tone={!mine.error && kpis.breached.length > 0 ? "danger" : "default"}
          hint={failed(firstBreach ? `${formatTicketRef(firstBreach.ticket_id)} · ${firstBreach.title}` : "All inside their targets")}
          to={firstBreach ? `${BASE}/tickets/${firstBreach.ticket_id}` : agentQueuePath("breached")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <SectionCard
          className="lg:col-span-3"
          title="My tickets, due soonest"
          description={mine.loading || mine.error || mine.total === 0 ? "Tickets you own" : `${plural(mine.total, "ticket")} you own · most at risk first`}
          action={<CardLink to={agentQueuePath("my-open")}>Open inbox</CardLink>}
          flush
        >
          {mine.loading ? (
            <CardSkeleton rows={5} />
          ) : mine.error ? (
            <div className="p-6">
              <ErrorState title="Couldn't load your tickets" onRetry={() => void mine.refetch()} retrying={mine.refetching} />
            </div>
          ) : mine.tickets.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Inbox}
              title="Nothing on your plate"
              description={next ? "Claim the next ticket in the queue to get started." : "Tickets you claim show up here."}
            />
          ) : (
            <ListBody>
              {mine.tickets.slice(0, MY_TICKETS_SHOWN).map((t) => (
                <MyTicketRow key={t.ticket_id} ticket={t} />
              ))}
            </ListBody>
          )}
          {!mine.loading && !mine.error && mine.total > MY_TICKETS_SHOWN && (
            <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground tabular-nums">
              Showing {MY_TICKETS_SHOWN} of {mine.total}, most at risk first
            </p>
          )}
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <SectionCard
            title="Next in queue"
            description={queue.loading || queue.error ? `Unassigned in ${team}` : `${queue.total} unassigned in ${team}`}
            action={<CardLink to={agentQueuePath("unassigned")}>Open queue</CardLink>}
            flush
          >
            {queue.loading ? (
              <CardSkeleton rows={3} withButton />
            ) : queue.error ? (
              <div className="p-6">
                <ErrorState title="Couldn't load the queue" onRetry={() => void queue.refetch()} retrying={queue.refetching} stacked />
              </div>
            ) : queue.tickets.length === 0 ? (
              <EmptyState size="compact" icon={CircleCheck} title="Queue clear" description={`Nothing unassigned in ${team}.`} />
            ) : (
              <ListBody>
                {queue.tickets.slice(0, QUEUE_SHOWN).map((t) => (
                  <QueueRow
                    key={t.ticket_id}
                    ticket={t}
                    onClaim={() => void claim(t)}
                    claiming={pendingId === t.ticket_id}
                    disabled={busy}
                  />
                ))}
              </ListBody>
            )}
          </SectionCard>

          <SectionCard
            title="My last 7 days"
            footer="Satisfaction scores arrive with ratings in Sprint 2 (S10)."
          >
            <dl className="grid grid-cols-3 gap-4 text-center">
              <MiniStat label="Resolved" loading={week.loading} value={week.error ? "—" : lastWeek.resolved} />
              <MiniStat
                label="Avg first reply"
                loading={week.loading}
                value={week.error || lastWeek.avgFirstReply === null ? "—" : formatTarget(lastWeek.avgFirstReply)}
              />
              <MiniStat label="CSAT" loading={false} value="—" muted />
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, loading, muted }: { label: string; value: ReactNode; loading: boolean; muted?: boolean }) {
  return (
    // The number reads first, the label sits under it (dt still comes first in the markup)
    <div className="flex flex-col-reverse items-center gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={muted ? "text-2xl font-semibold text-muted-foreground tabular-nums" : "text-2xl font-semibold text-foreground tabular-nums"}>
        {loading ? <Skeleton className="h-8 w-12 bg-foreground/[0.07]" /> : value}
      </dd>
    </div>
  );
}

const linkState = (view: string): TicketLinkState => ({ view });

/** One of my tickets: ref · title + requester/category (· Waiting) · SLA chip */
function MyTicketRow({ ticket }: { ticket: Ticket }) {
  const clock = rowClock(ticket);
  const meta = [ticket.requester_name, ticket.category_name].filter(Boolean).join(" · ");
  const waiting = ticket.ticket_status === "Waiting on employee";
  return (
    <ListRow
      to={`${BASE}/tickets/${ticket.ticket_id}`}
      state={linkState(AGENT_VIEWS["my-open"].id)}
      grid="sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
      className="gap-2 py-4"
    >
      <TicketRef id={ticket.ticket_id} className="hidden sm:block" />
      <div className="flex min-w-0 flex-col gap-1">
        <TicketRef id={ticket.ticket_id} className="sm:hidden" />
        <span className="line-clamp-2 text-sm font-medium text-foreground sm:truncate">{ticket.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{meta || "No details"}</span>
          {waiting && <StatusBadge status={ticket.ticket_status} className="shrink-0" />}
        </span>
      </div>
      <div className="flex sm:justify-end">{clock && <SlaChip due={clock.due} met={clock.met} start={clock.start} />}</div>
    </ListRow>
  );
}

/** A queue ticket with its Claim button; the title opens it, Claim stays on the page */
function QueueRow({
  ticket,
  onClaim,
  claiming,
  disabled,
}: {
  ticket: Ticket;
  onClaim: () => void;
  claiming: boolean;
  disabled: boolean;
}) {
  const clock = rowClock(ticket);
  return (
    <ListRow grid="" className="flex-row items-start gap-4 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <TicketRef id={ticket.ticket_id} />
          <PriorityBadge priority={ticket.ticket_priority} />
        </div>
        <ListRowLink to={`${BASE}/tickets/${ticket.ticket_id}`} state={linkState(AGENT_VIEWS.unassigned.id)} className="min-w-0 rounded-sm">
          <span className="line-clamp-2 text-sm font-medium text-foreground">{ticket.title}</span>
        </ListRowLink>
        <span className="truncate text-xs text-muted-foreground">
          {[ticket.requester_name || "Unknown requester", ticket.category_name].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {clock && <SlaChip due={clock.due} met={clock.met} start={clock.start} />}
        <ClaimButton ticketId={ticket.ticket_id} onClaim={onClaim} claiming={claiming} disabled={disabled} />
      </div>
    </ListRow>
  );
}

/** Placeholder rows shaped like the card's rows */
function CardSkeleton({ rows, withButton }: { rows: number; withButton?: boolean }) {
  const SK = "bg-foreground/[0.07]";
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={`h-3 w-24 ${SK}`} />
            <Skeleton className={`h-4 ${["w-3/4", "w-2/3", "w-1/2", "w-3/5"][i % 4]} ${SK}`} />
            <Skeleton className={`h-3 w-32 ${SK}`} />
          </div>
          {withButton ? <Skeleton className={`h-8 w-16 ${SK}`} /> : <Skeleton className={`h-5 w-24 rounded-full ${SK}`} />}
        </li>
      ))}
    </ul>
  );
}
