// SLA maths (briefing p.5, p.12 S3). Pure functions plus one loader. Sprint 1 keeps it simple:
// calendar minutes, no business hours, no pause while Waiting on employee (those are S11, Sprint 2).
//   first_response_due_at = created_at + policy[priority].first_response_mins
//   resolution_due_at     = created_at + policy[priority].resolution_mins
// Changing priority recalculates both from created_at, never from now.
import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { SlaState, TicketPriority, TicketStatus } from "../types/ticket.types";

export type { SlaState };

export interface SlaPolicy {
  priority: TicketPriority;
  first_response_mins: number;
  resolution_mins: number;
}

/** Policies as an array (from the table) or keyed by priority */
export type SlaPolicies = SlaPolicy[] | Partial<Record<TicketPriority, SlaPolicy>>;

/** "Due soon" (amber) = less than this share of the target left (page 12) */
export const DUE_SOON_SHARE = 0.25;

const MINUTE_MS = 60_000;

type Timestamp = Date | string | number | null | undefined;

const toMs = (value: Timestamp): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const policyFor = (policies: SlaPolicies, priority: TicketPriority): SlaPolicy | undefined =>
  Array.isArray(policies) ? policies.find((p) => p.priority === priority) : policies[priority];

/** Reads every row of sla_policy. Pass the transaction client when inside withTransaction(). */
export const loadSlaPolicies = async (client?: PoolClient): Promise<SlaPolicy[]> => {
  const { rows } = await (client ?? pool).query<SlaPolicy>(
    "SELECT priority, first_response_mins, resolution_mins FROM sla_policy"
  );
  return rows;
};

/**
 * Both due times for a ticket created at `createdAt` with `priority`.
 * Throws when `policies` has no row for the priority (the seed and migration create all four).
 * @example computeDueTimes("2026-11-10T08:14:00+02:00", "High", policies)
 *          // first_response_due_at 09:14, resolution_due_at 16:14 (page 5)
 */
export const computeDueTimes = (
  createdAt: Date | string,
  priority: TicketPriority,
  policies: SlaPolicies
): { first_response_due_at: Date; resolution_due_at: Date } => {
  const policy = policyFor(policies, priority);
  if (!policy) throw new Error(`No SLA policy for priority ${priority}`);
  const start = new Date(createdAt).getTime();
  return {
    first_response_due_at: new Date(start + policy.first_response_mins * MINUTE_MS),
    resolution_due_at: new Date(start + policy.resolution_mins * MINUTE_MS),
  };
};

/**
 * One clock: met (stopped in time), breached (stopped late, or past due while running),
 * due_soon (running, under 25% of the target left), on_track.
 * A clock without a due time counts as on_track.
 */
export const clockState = (
  due: Timestamp,
  stoppedAt: Timestamp,
  startedAt: Timestamp,
  now: Date = new Date()
): SlaState => {
  const dueMs = toMs(due);
  if (dueMs === null) return "on_track";
  const stoppedMs = toMs(stoppedAt);
  if (stoppedMs !== null) return stoppedMs <= dueMs ? "met" : "breached";
  const nowMs = now.getTime();
  if (nowMs > dueMs) return "breached";
  const startMs = toMs(startedAt);
  const target = startMs !== null && dueMs > startMs ? dueMs - startMs : null;
  if (target !== null && dueMs - nowMs < target * DUE_SOON_SHARE) return "due_soon";
  return "on_track";
};

/** The ticket fields slaState() needs */
export interface SlaTicket {
  ticket_status: TicketStatus;
  created_at: Timestamp;
  first_response_due_at: Timestamp;
  resolution_due_at: Timestamp;
  first_response_at: Timestamp;
  resolved_at: Timestamp;
}

/**
 * The ticket's overall SLA state for chips, sorting and the "Breached" view:
 *   breached  - a running clock is past due, or (finished tickets) a clock stopped late
 *   met       - both clocks stopped in time (resolved / closed inside both targets)
 *   due_soon  - a running clock has under 25% of its target left
 *   on_track  - otherwise
 * Resolving also stops the first-response clock (a resolution counts as the response).
 * Cancelled tickets have no promise left to keep: always "met".
 */
export const slaState = (ticket: SlaTicket, now: Date = new Date()): SlaState => {
  if (ticket.ticket_status === "Cancelled") return "met";
  const resolvedAt = ticket.resolved_at ?? null;
  let first = clockState(ticket.first_response_due_at, ticket.first_response_at ?? resolvedAt, ticket.created_at, now);
  // Live ticket: a late first reply that has happened is history, not a breach (SQL_IS_BREACHED)
  const live = !resolvedAt && ticket.ticket_status !== "Closed";
  if (live && first === "breached" && ticket.first_response_at) first = "met";
  const resolution = clockState(ticket.resolution_due_at, resolvedAt, ticket.created_at, now);

  if (first === "breached" || resolution === "breached") return "breached";
  if (first === "met" && resolution === "met") return "met";
  if (first === "due_soon" || resolution === "due_soon") return "due_soon";
  return "on_track";
};

/** The nearest unmet due time: what queues sort by (page 12: "ordered by the nearest unmet due time") */
export const nextDueAt = (ticket: SlaTicket): Date | null => {
  if (ticket.resolved_at || ticket.ticket_status === "Cancelled" || ticket.ticket_status === "Closed") return null;
  const candidates = [
    ticket.first_response_at ? null : toMs(ticket.first_response_due_at),
    toMs(ticket.resolution_due_at),
  ].filter((ms): ms is number => ms !== null);
  return candidates.length ? new Date(Math.min(...candidates)) : null;
};

/**
 * The same rules as SQL, for list queries (alias `t` = ticket). Use in ORDER BY / WHERE so sorting
 * and the Breached filter happen in the database:
 *   ORDER BY ${SQL_NEXT_DUE} ASC NULLS LAST
 *   WHERE ${SQL_IS_BREACHED}
 */
export const SQL_NEXT_DUE = `(CASE
  WHEN t.resolved_at IS NOT NULL OR t.ticket_status IN ('Closed', 'Cancelled') THEN NULL
  WHEN t.first_response_at IS NULL THEN LEAST(t.first_response_due_at, t.resolution_due_at)
  ELSE t.resolution_due_at
END)`;

/**
 * Breached as SQL. A live ticket (not resolved, not Closed) is breached while a RUNNING clock is
 * past due: no first response yet and first_response_due_at passed, or resolution_due_at passed
 * (p.17). A first reply that came late but has happened no longer counts, so the number matches the
 * row's SLA chip (the next unmet due time). A finished ticket is breached when a clock stopped late.
 */
export const SQL_IS_BREACHED = `(t.ticket_status <> 'Cancelled' AND CASE
  WHEN t.resolved_at IS NULL AND t.ticket_status <> 'Closed' THEN COALESCE(
    (t.first_response_at IS NULL AND t.first_response_due_at < now())
    OR t.resolution_due_at < now(),
    false)
  ELSE COALESCE(
    t.first_response_due_at < COALESCE(t.first_response_at, t.resolved_at)
    OR t.resolution_due_at < t.resolved_at,
    false)
END)`;
