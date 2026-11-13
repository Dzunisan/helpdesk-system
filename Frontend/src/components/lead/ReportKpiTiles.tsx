import { AlarmClock, Inbox, MessageSquareReply, Smile, Timer, UserRoundX } from "lucide-react";
import type { ReportSummary } from "@/types/api";
import { formatDuration } from "@/lib/format";
import StatCard from "@/components/app/StatCard";
import { cn } from "@/lib/utils";
import { minutesOrDash, pctOrDash } from "./reportFormat";

interface ReportKpiTilesProps {
  /** null while loading */
  summary: ReportSummary | null;
  loading: boolean;
  /**
   * Where the counts link to (the lead's All tickets tabs). Leave out for the System Admin,
   * who sees aggregates only and never ticket lists.
   */
  linkBase?: string;
  /** Where the CSAT tile goes, e.g. "#recent-feedback" (the dashboard's Recent feedback card) */
  csatTo?: string;
  className?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The six S8 KPI tiles (briefing p.17, p.54, p.60): open backlog, unassigned (oldest age),
 * breached, avg first response, avg resolution, CSAT + reopen rate. Shared by the lead
 * dashboard and the System Admin overview. Two per row on phones, three on laptops, six on wide screens.
 */
export default function ReportKpiTiles({ summary: s, loading, linkBase, csatTo, className }: ReportKpiTilesProps) {
  const link = (tab: string) => (linkBase ? `${linkBase}/all-tickets?tab=${tab}` : undefined);
  const busy = loading || !s;

  return (
    <section aria-label="Department numbers" className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6", className)}>
      <StatCard
        label="Open backlog"
        icon={Inbox}
        loading={busy}
        value={s?.backlog}
        hint={s && (s.backlog === 0 ? "Nothing open" : "New, open and waiting")}
        to={link("open")}
      />
      <StatCard
        label="Unassigned"
        icon={UserRoundX}
        loading={busy}
        value={s?.unassigned}
        tone={s && s.unassigned > 0 ? "warning" : "default"}
        hint={s && (s.oldest_unassigned_mins !== null ? `Oldest ${formatDuration(s.oldest_unassigned_mins)}` : "Queue clear")}
        to={link("unassigned")}
      />
      <StatCard
        label="Breached"
        icon={AlarmClock}
        loading={busy}
        value={s?.breached}
        tone={s && s.breached > 0 ? "danger" : "default"}
        hint={s && (s.breached === 0 ? "Nothing overdue" : breachHint(s))}
        to={link("breached")}
      />
      <StatCard
        label="Avg first response"
        icon={MessageSquareReply}
        loading={busy}
        value={s && minutesOrDash(s.avg_first_response_mins)}
        hint={
          s &&
          (s.avg_first_response_mins === null
            ? `No replies in ${s.days} days`
            : s.first_response_within_target_pct !== null
              ? `${pctOrDash(s.first_response_within_target_pct)} within target`
              : `Last ${s.days} days`)
        }
      />
      <StatCard
        label="Avg resolution"
        icon={Timer}
        loading={busy}
        value={s && minutesOrDash(s.avg_resolution_mins)}
        hint={
          s &&
          (s.avg_resolution_mins === null
            ? `Nothing resolved in ${s.days} days`
            : s.resolution_within_target_pct !== null
              ? `${pctOrDash(s.resolution_within_target_pct)} within SLA`
              : `Last ${s.days} days`)
        }
      />
      <StatCard
        label="CSAT"
        icon={Smile}
        loading={busy}
        value={s && pctOrDash(s.csat_pct)}
        hint={
          s &&
          [s.csat_responses > 0 ? plural(s.csat_responses, "rating") : "No ratings yet", s.reopen_rate_pct !== null && `reopen ${pctOrDash(s.reopen_rate_pct)}`]
            .filter(Boolean)
            .join(" · ")
        }
        to={csatTo}
      />
    </section>
  );
}

function breachHint(s: ReportSummary): string {
  const parts = [
    s.breached_first_response > 0 && `${s.breached_first_response} first response`,
    s.breached_resolution > 0 && `${s.breached_resolution} resolution`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Past a due time";
}
