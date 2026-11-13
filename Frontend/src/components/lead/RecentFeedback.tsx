import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquareQuote } from "lucide-react";
import { useApiData } from "@/hooks/useApiData";
import { getCsatReport } from "@/services/reports";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CsatRecentFeedback } from "@/types/api";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import TicketRef from "@/components/app/TicketRef";
import { ListBody, ListRow } from "@/components/app/ListCard";
import { StarsShown } from "@/components/feedback/StarRating";
import { ratingWord } from "@/components/feedback/csat";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { pctOrDash, type ReportDays } from "./reportFormat";

/** The anchor the CSAT tile links to */
export const RECENT_FEEDBACK_ID = "recent-feedback";

const SHOWN = 5;
const SK = "bg-foreground/[0.07]";

/**
 * "Recent feedback" (briefing p.19 step 6, p.54): the newest CSAT ratings for the lead's department,
 * stars, quick tags and the comment, each opening its ticket. Fed by GET /api/reports/csat?days=N
 * (the server forces the lead's own department). The KPI tile "CSAT" scrolls here.
 */
export default function RecentFeedback({
  days,
  ticketBase,
  className,
}: {
  days: ReportDays;
  /** "/department-lead": rows open `${ticketBase}/tickets/:id` */
  ticketBase: string;
  className?: string;
}) {
  const csat = useApiData(() => getCsatReport({ days }), `csat-${days}`);
  const { hash } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const ready = !csat.loading;

  // Arriving from the CSAT tile (#recent-feedback): bring the card into view once it has content
  useEffect(() => {
    if (hash === `#${RECENT_FEEDBACK_ID}` && ready) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, ready]);

  const report = csat.data;
  const recent = report?.recent.slice(0, SHOWN) ?? [];
  const description = report
    ? report.responses > 0
      ? `${pctOrDash(report.csat_pct)} CSAT from ${report.responses} ${report.responses === 1 ? "rating" : "ratings"} · last ${days} days`
      : `Last ${days} days`
    : `Last ${days} days`;

  return (
    <div id={RECENT_FEEDBACK_ID} ref={ref} className={cn("scroll-mt-6", className)}>
      <SectionCard title="Recent feedback" description={description} flush>
        {csat.loading ? (
          <FeedbackSkeleton />
        ) : csat.error && !report ? (
          <div className="p-6">
            <ErrorState stacked title="Couldn't load feedback" onRetry={csat.reload} retrying={csat.refreshing} />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            size="compact"
            icon={MessageSquareQuote}
            title="No ratings yet"
            description={`Nobody rated a closed request in the last ${days} days.`}
          />
        ) : (
          <ListBody>
            {recent.map((f) => (
              <FeedbackRow key={f.feedback_id} feedback={f} to={`${ticketBase}/tickets/${f.ticket_id}`} />
            ))}
          </ListBody>
        )}
      </SectionCard>
    </div>
  );
}

/** Stars + word · tags, the comment, then ref · requester → agent · when */
function FeedbackRow({ feedback: f, to }: { feedback: CsatRecentFeedback; to: string }) {
  const low = f.rating <= 2;
  return (
    <ListRow to={to} grid="" className="gap-2 py-4" aria-label={`HD-${f.ticket_id}: ${f.rating} stars. ${f.comment ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StarsShown value={f.rating} />
        <span className={cn("text-xs font-medium", low ? "text-destructive" : "text-muted-foreground")}>{ratingWord(f.rating)}</span>
        {f.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="font-normal">
            {tag}
          </Badge>
        ))}
      </div>
      {f.comment ? (
        <p className="line-clamp-3 text-sm text-foreground">“{f.comment}”</p>
      ) : (
        <p className="text-sm text-muted-foreground">No comment</p>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <TicketRef id={f.ticket_id} />
        <span className="min-w-0 truncate">
          {f.requester_name ?? "Employee"} on {f.agent_name ?? "the team"}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{formatSast(f.created_at)}</span>
      </div>
    </ListRow>
  );
}

function FeedbackSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex flex-col gap-2.5 px-6 py-4">
          <Skeleton className={cn(SK, "h-4 w-28")} />
          <Skeleton className={cn(SK, "h-4", ["w-3/4", "w-2/3", "w-1/2"][i])} />
          <Skeleton className={cn(SK, "h-3 w-40")} />
        </li>
      ))}
    </ul>
  );
}
