import { useMemo, useState } from "react";
import { CircleCheck, Hourglass, Inbox, UserRoundX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTickets } from "@/hooks/useTickets";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { formatAge, formatSast, formatTicketRef } from "@/lib/format";
import { toPriority, toStatus } from "@/lib/ticketVocabulary";
import type { Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import CardLink from "@/components/app/CardLink";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import { ListBody, ListRow, ListRowLink } from "@/components/app/ListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ClaimButton, ClaimNextButton } from "@/components/queue/ClaimButton";
import { byUrgency, isActive, isDone, isUnassigned } from "@/components/queue/queueUtils";
import { useClaim, useClaimNextShortcut } from "@/components/queue/useClaim";

const BASE = "/agent";
const MY_TICKETS_SHOWN = 6;
const QUEUE_SHOWN = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "Good morning" / "Good afternoon" / "Good evening", by the hour in SAST */
function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Johannesburg" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Agent home, "start of shift" (briefing p.46) */
export default function AgentDashboard() {
  const { user } = useAuth();
  const userId = user?.id || user?.user_id || "";
  const departmentId = user?.department_id ?? undefined;
  const departmentName = useDepartmentName(departmentId);

  // Tickets assigned to me
  const {
    tickets: myTickets,
    loading: myLoading,
    error: myError,
    isRefetching: myRefetching,
    refetch: refetchMy,
  } = useTickets({
    filters: { assignee_id: userId ? String(userId) : undefined, limit: 100 },
    autoFetch: !!userId,
  });

  // The department's unassigned tickets (the server scopes this to my department)
  const {
    tickets: deptTickets,
    loading: deptLoading,
    error: deptError,
    isRefetching: deptRefetching,
    claimTicket,
    refetch: refetchDept,
  } = useTickets({
    filters: { status: "Open", department_id: departmentId ? Number(departmentId) : undefined, limit: 100 },
    autoFetch: true,
  });

  const { claim, pendingId, busy } = useClaim({
    claimTicket,
    basePath: BASE,
    onClaimed: refetchMy,
    onConflict: refetchDept,
  });

  const mine = useMemo(() => myTickets.filter(isActive).sort(byUrgency), [myTickets]);
  const queue = useMemo(() => deptTickets.filter(isUnassigned).sort(byUrgency), [deptTickets]);
  const resolved = useMemo(() => myTickets.filter(isDone), [myTickets]);

  const highMine = mine.filter((t) => ["urgent", "high"].includes(toPriority(t.ticket_priority))).length;
  const highQueue = queue.filter((t) => ["urgent", "high"].includes(toPriority(t.ticket_priority))).length;
  const oldestMine = useMemo(
    () => [...mine].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0],
    [mine],
  );
  const oldestQueued = useMemo(
    () => [...queue].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0],
    [queue],
  );
  // "Now" when the page opened; good enough for a 7-day window
  const [openedAt] = useState(() => Date.now());
  const resolvedThisWeek = resolved.filter(
    (t) => openedAt - new Date(t.updated_at || t.created_at).getTime() <= WEEK_MS,
  ).length;

  const next = queue[0];
  const claimNext = () => {
    if (next && !busy) claim(next);
  };
  useClaimNextShortcut(claimNext, !!next && !busy && !deptLoading);

  const teamLabel = departmentName ?? "your department";
  const firstName = user?.name?.trim() || "there";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={[formatSast(new Date(), "long"), departmentName].filter(Boolean).join(" · ")}
        actions={
          <ClaimNextButton onClick={claimNext} disabled={!next || deptLoading} busy={busy && pendingId === next?.ticket_id} />
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="My open"
          icon={Inbox}
          loading={myLoading}
          value={myError ? "—" : mine.length}
          hint={myError ? "Couldn't load" : highMine > 0 ? `${highMine} high priority` : "Nothing high priority"}
          to={`${BASE}/assigned-tickets`}
        />
        <StatCard
          label="Unassigned"
          icon={UserRoundX}
          loading={deptLoading}
          value={deptError ? "—" : queue.length}
          tone={!deptError && highQueue > 0 ? "warning" : "default"}
          hint={
            deptError
              ? "Couldn't load"
              : highQueue > 0
                ? `${highQueue} high priority`
                : oldestQueued
                  ? `Oldest ${formatAge(oldestQueued.created_at)}`
                  : "Queue clear"
          }
          to={`${BASE}/ticket-queue`}
        />
        <StatCard
          label="Oldest open"
          icon={Hourglass}
          loading={myLoading}
          value={myError || !oldestMine ? "—" : formatAge(oldestMine.created_at)}
          hint={myError ? "Couldn't load" : oldestMine ? `${formatTicketRef(oldestMine.ticket_id)} · ${oldestMine.title}` : "Nothing open"}
          to={oldestMine ? `${BASE}/tickets/${oldestMine.ticket_id}` : undefined}
        />
        <StatCard
          label="Resolved"
          icon={CircleCheck}
          loading={myLoading}
          value={myError ? "—" : resolved.length}
          hint={myError ? "Couldn't load" : `${resolvedThisWeek} in the last 7 days`}
          to={`${BASE}/resolved-tickets`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* My tickets */}
        <SectionCard
          className="lg:col-span-3"
          title="My tickets"
          description={myLoading || myError || mine.length === 0 ? "Tickets you own, highest priority first" : `${mine.length} open · highest priority first`}
          action={<CardLink to={`${BASE}/assigned-tickets`}>View all</CardLink>}
          flush
        >
          {myLoading ? (
            <CardSkeleton rows={4} />
          ) : myError ? (
            <div className="p-6">
              <ErrorState title="Couldn't load your tickets" onRetry={() => refetchMy()} retrying={myRefetching} />
            </div>
          ) : mine.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Inbox}
              title="Nothing on your plate"
              description={next ? "Claim the next ticket in the queue to get started." : "New tickets you claim will show up here."}
            />
          ) : (
            <ListBody>
              {mine.slice(0, MY_TICKETS_SHOWN).map((t) => (
                <MyTicketRow key={t.ticket_id} ticket={t} />
              ))}
            </ListBody>
          )}
          {!myLoading && !myError && mine.length > MY_TICKETS_SHOWN && (
            <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground tabular-nums">
              Showing {MY_TICKETS_SHOWN} of {mine.length}, highest priority first
            </p>
          )}
        </SectionCard>

        {/* Next in queue */}
        <SectionCard
          className="lg:col-span-2"
          title="Next in queue"
          description={
            deptLoading || deptError || queue.length === 0 ? `Unassigned in ${teamLabel}` : `${queue.length} unassigned in ${teamLabel}`
          }
          action={<CardLink to={`${BASE}/ticket-queue`}>Open queue</CardLink>}
          flush
        >
          {deptLoading ? (
            <CardSkeleton rows={3} withButton />
          ) : deptError ? (
            <div className="p-6">
              <ErrorState
                title="Couldn't load the queue"
                onRetry={() => refetchDept()}
                retrying={deptRefetching}
                stacked
              />
            </div>
          ) : queue.length === 0 ? (
            <EmptyState size="compact" icon={CircleCheck} title="Queue clear" description={`Nothing unassigned in ${teamLabel}.`} />
          ) : (
            <ListBody>
              {queue.slice(0, QUEUE_SHOWN).map((t) => (
                <ListRow key={t.ticket_id} grid="" className="flex-row items-center gap-4 py-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <TicketRef id={t.ticket_id} />
                      <PriorityBadge priority={t.ticket_priority} />
                    </div>
                    <ListRowLink to={`${BASE}/tickets/${t.ticket_id}`} className="min-w-0 rounded-sm">
                      <span className="line-clamp-2 text-sm font-medium text-foreground">{t.title}</span>
                    </ListRowLink>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {t.requester_name || "Unknown requester"} · {formatAge(t.created_at)} old
                    </span>
                  </div>
                  <ClaimButton
                    ticketId={t.ticket_id}
                    onClaim={() => claim(t)}
                    claiming={pendingId === t.ticket_id}
                    disabled={busy}
                  />
                </ListRow>
              ))}
            </ListBody>
          )}
          {!deptLoading && !deptError && queue.length > QUEUE_SHOWN && (
            <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground tabular-nums">
              Showing {QUEUE_SHOWN} of {queue.length}, most urgent first
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/** One of my tickets: ref · title + requester/category · (status if not plain Open) · priority */
function MyTicketRow({ ticket }: { ticket: Ticket }) {
  const status = toStatus(ticket.ticket_status);
  const meta = [ticket.requester_name, ticket.category_name].filter(Boolean).join(" · ");
  const badges = (
    <>
      {status !== "open" && <StatusBadge status={ticket.ticket_status} />}
      <PriorityBadge priority={ticket.ticket_priority} />
    </>
  );
  return (
    <ListRow
      to={`${BASE}/tickets/${ticket.ticket_id}`}
      grid="sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
      className="py-4"
    >
      <TicketRef id={ticket.ticket_id} className="hidden sm:block" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2 sm:hidden">
          <TicketRef id={ticket.ticket_id} />
          {badges}
        </div>
        <span className="line-clamp-2 text-sm font-medium text-foreground sm:truncate">{ticket.title}</span>
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          {meta || "No details"} · {formatAge(ticket.created_at)} old
        </span>
      </div>
      <div className="hidden items-center gap-2 sm:flex sm:justify-end">{badges}</div>
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
          {withButton ? <Skeleton className={`h-8 w-16 ${SK}`} /> : <Skeleton className={`h-5 w-16 rounded-full ${SK}`} />}
        </li>
      ))}
    </ul>
  );
}
