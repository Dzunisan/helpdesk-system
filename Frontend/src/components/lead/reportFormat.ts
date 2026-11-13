import type { ReportSummary, Ticket, WorkloadRow } from "@/types/api";
import { formatDuration } from "@/lib/format";

/*
 * Small helpers shared by the S8 screens (lead dashboard, team & workload, admin overview).
 * The report endpoints answer null (never NaN) when there is nothing to average.
 */

/** "44m", "10h 30m", or "—" when there is no data */
export const minutesOrDash = (mins: number | null | undefined): string =>
  mins === null || mins === undefined || !Number.isFinite(mins) ? "—" : formatDuration(mins);

/** "91%", or "—" when there is no data */
export const pctOrDash = (pct: number | null | undefined): string =>
  pct === null || pct === undefined || !Number.isFinite(pct) ? "—" : `${Math.round(pct)}%`;

/** Optional fields a report may add on top of the contract shape (shown when present) */
export type SummaryWithExtras = ReportSummary & {
  /** Most requested categories in the window, busiest first */
  top_categories?: { category_id: number; category_name: string; count: number }[];
};

export type WorkloadRowWithExtras = WorkloadRow & {
  /** Average minutes to their first reply in the window */
  avg_first_response_mins?: number | null;
  /** false when the agent is away (no leave data yet: absent means available) */
  available?: boolean;
  /** "On leave until 12 Nov" */
  availability_note?: string | null;
};

/** The due time that matters now: first response until it happens, then resolution */
export const nextDue = (t: Ticket): string | null =>
  t.first_response_at ? t.resolution_due_at : t.first_response_due_at ?? t.resolution_due_at;

/** Work in hand: open + waiting on employee (the load bar, p.57) */
export const loadOf = (row: Pick<WorkloadRow, "open" | "waiting">) => row.open + row.waiting;

/** Load bar colours (p.57): amber at 8+, rose at 10+ */
export const LOAD_AMBER = 8;
export const LOAD_ROSE = 10;

/** The dashboard's date range choices (p.54 "Last 30 days") */
export const REPORT_DAY_OPTIONS = [7, 30, 90] as const;
export type ReportDays = (typeof REPORT_DAY_OPTIONS)[number];
