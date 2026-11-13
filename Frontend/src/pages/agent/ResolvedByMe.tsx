import { useMemo, useState } from "react";
import { ChevronRight, CircleCheck, Lock, RotateCcw, RotateCw, SearchX, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ticket, TicketFeedback } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { SlaChip } from "@/components/app/SlaChip";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DateRangePicker from "@/components/app/DateRangePicker";
import { inDayRange, lastDays, rangeLabel, type DayRange } from "@/lib/dayRange";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import QueueFilters from "@/components/queue/QueueFilters";
import { useDepartmentCategories, useQueueFilters } from "@/components/queue/useQueueFilters";
import { useTicketList } from "@/components/queue/useTicketList";
import { AGENT_VIEWS, type TicketLinkState } from "@/components/queue/queueViews";
import { plural } from "@/components/queue/queueUtils";
import { csatOf, useTicketRatings } from "./useTicketRatings";

/** Quick picks in the period picker (p.53); any other range comes from its calendar */
const PRESETS = [7, 30, 90] as const;

/** Ref · Subject + requester · Resolved · Resolution time · Rating · Reopened · chevron (p.53) */
const GRID =
  "lg:grid lg:grid-cols-[3.75rem_minmax(0,1fr)_8.5rem_9.5rem_6.5rem_8rem_1rem] lg:items-center lg:gap-4 xl:gap-6";

const resolvedAt = (t: Ticket) => t.resolved_at ?? t.closed_at;

/**
 * Resolved by me (briefing p.53, S10): the agent's finished tickets with the real resolved_at,
 * the resolution time against its target (met / breached), the requester's star rating once the
 * ticket closed, and a "Reopened" flag. The whole row opens the ticket.
 */
export default function ResolvedByMe() {
  const { user } = useAuth();
  const view = AGENT_VIEWS.resolved;
  const team = useDepartmentName(user?.department_id ?? undefined) ?? "your department";
  const [period, setPeriod] = useState<DayRange>(() => lastDays(30));

  const filters = useQueueFilters();
  const categories = useDepartmentCategories(user?.department_id);
  const list = useTicketList({ ...view.params, ...filters.params, limit: 100 });

  const tickets = useMemo(
    () =>
      list.tickets
        .filter((t) => {
          const at = resolvedAt(t);
          return at ? inDayRange(at, period) : false;
        })
        .sort((a, b) => Date.parse(resolvedAt(b)!) - Date.parse(resolvedAt(a)!)),
    [list.tickets, period],
  );

  const { ratings, loading: ratingsLoading } = useTicketRatings(tickets);
  const summary = useMemo(() => {
    const timed = tickets.filter((t) => t.resolution_due_at && resolvedAt(t));
    const within = timed.filter((t) => Date.parse(resolvedAt(t)!) <= Date.parse(t.resolution_due_at!)).length;
    return { withinPct: timed.length ? Math.round((within / timed.length) * 100) : null, csat: csatOf(ratings.values()) };
  }, [tickets, ratings]);

  const periodLabel = rangeLabel(period, PRESETS);
  const description =
    list.loading || list.error
      ? `${periodLabel} · tickets you resolved`
      : [
          periodLabel,
          plural(tickets.length, "ticket"),
          summary.withinPct !== null ? `${summary.withinPct}% within SLA` : null,
          summary.csat.pct !== null ? `${summary.csat.pct}% CSAT from ${plural(summary.csat.responses, "rating")}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={view.label}
        description={description}
        actions={
          <>
            <DateRangePicker aria-label="Period" value={period} onChange={setPeriod} presets={PRESETS} className="w-44" />
            <Button variant="outline" onClick={() => void list.refetch()} disabled={list.loading || list.refetching} className="h-10 sm:h-9">
              <RotateCw data-icon="inline-start" className={list.refetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      <QueueFilters filters={filters} categories={categories} hideSla searchId="resolved-search" />

      {list.error && !list.loading ? (
        <ErrorState
          title="Couldn't load your resolved tickets"
          description={list.error.status === 0 ? undefined : list.error.message}
          onRetry={() => void list.refetch()}
          retrying={list.refetching}
        />
      ) : (
        <ListCard>
          <ListHeaderRow grid={GRID}>
            <span>Ref</span>
            <span>Subject</span>
            <span>Resolved</span>
            <span>Resolution time</span>
            <span>Rating</span>
            <span className="sr-only">Reopened</span>
            <span className="sr-only">Open</span>
          </ListHeaderRow>
          {list.loading ? (
            <LoadingRows grid={GRID} breakpoint="lg" rows={6} columns={["meta", "title", "meta", "badge", "meta", "blank", "icon"]} />
          ) : tickets.length === 0 ? (
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
              <EmptyState
                icon={CircleCheck}
                title={periodLabel.startsWith("Last") ? `Nothing resolved in the ${periodLabel.toLowerCase()}` : `Nothing resolved ${periodLabel}`}
                description={periodLabel === "Last 90 days" ? view.empty.description : "Try a longer period, or resolve a ticket from My open."}
              />
            )
          ) : (
            <ListBody>
              {tickets.map((t) => (
                <ResolvedRow
                  key={t.ticket_id}
                  ticket={t}
                  rating={ratings.get(t.ticket_id)}
                  ratingLoading={ratingsLoading && t.ticket_status === "Closed" && !ratings.has(t.ticket_id)}
                  viewId={view.id}
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!list.loading && !list.error && (
        <ListCaption className="-mt-5 flex items-center gap-1.5">
          <Lock className="size-3 shrink-0" aria-hidden />
          Tickets you own in {team} that are Resolved or Closed. Ratings arrive when the requester closes a ticket.
        </ListCaption>
      )}
    </div>
  );
}

function ResolvedRow({
  ticket: t,
  rating,
  ratingLoading,
  viewId,
}: {
  ticket: Ticket;
  rating: TicketFeedback | null | undefined;
  ratingLoading: boolean;
  viewId: string;
}) {
  const at = resolvedAt(t)!;
  const resolvedLabel = formatSast(at, "smart").replace("Today, ", "Today ").replace("Yesterday, ", "Yesterday ");
  return (
    <ListRow
      grid={GRID}
      to={`/agent/tickets/${t.ticket_id}`}
      state={{ view: viewId } satisfies TicketLinkState}
      aria-label={`${t.title}, resolved ${formatSast(at, "full")}`}
      className="gap-2 py-4 lg:py-5"
    >
      <TicketRef id={t.ticket_id} className="hidden lg:block" />
      <div className="flex min-w-0 flex-col gap-1">
        <TicketRef id={t.ticket_id} className="lg:hidden" />
        <span className="line-clamp-2 text-sm font-medium text-foreground">{t.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <UserAvatar name={t.requester_name || "Unknown"} size="sm" className="data-[size=sm]:size-5" />
          <span className="truncate">{t.requester_name || "Unknown requester"}</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:contents">
        <time dateTime={at} title={formatSast(at, "full")} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums lg:text-sm lg:text-foreground">
          <span className="lg:hidden">Resolved </span>
          {resolvedLabel}
        </time>
        <div className="flex">
          {t.resolution_due_at ? (
            <SlaChip due={t.resolution_due_at} met={at} start={t.created_at} />
          ) : (
            <span className="text-xs text-muted-foreground">No target</span>
          )}
        </div>
        <div className="flex">
          <RatingCell ticket={t} rating={rating} loading={ratingLoading} />
        </div>
        <div className="flex">
          {t.reopen_count > 0 && (
            <Badge variant="destructive" className="gap-1">
              <RotateCcw aria-hidden />
              {t.reopen_count === 1 ? "Reopened once" : `Reopened ${t.reopen_count}×`}
            </Badge>
          )}
        </div>
        <ChevronRight className="ml-auto hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 lg:block" aria-hidden />
      </div>
    </ListRow>
  );
}

function RatingCell({ ticket, rating, loading }: { ticket: Ticket; rating: TicketFeedback | null | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-3.5 w-20 bg-foreground/[0.07]" />;
  if (ticket.ticket_status === "Resolved") return <span className="text-xs text-muted-foreground">Awaiting confirmation</span>;
  if (!rating) return <span className="text-xs text-muted-foreground">Not rated</span>;
  const stars = <Stars value={rating.rating} />;
  if (!rating.comment && !rating.tags?.length) return stars;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative z-10 inline-flex cursor-default">{stars}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {rating.comment ? `“${rating.comment}”` : null}
        {rating.tags?.length ? <span className="block opacity-80">{rating.tags.join(" · ")}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** 1-5 stars, filled in amber (the rating colour on p.53) */
function Stars({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-3.5", n <= value ? "fill-warning-solid text-warning-solid" : "fill-transparent text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}
