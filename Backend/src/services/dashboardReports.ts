// S8 Lead dashboard & workload (briefing p.17, p.54, p.57). Contract: docs/api-sprint-2.md "S8".
// Every number is one plain SQL COUNT / AVG over ticket, ticket_feedback and users, so it matches a
// manual count. The department is decided by the controller (a lead's own, forced); departmentId
// null = every department (System Admin only, aggregates only). Empty departments come back as
// zeros and nulls, never NaN.
import { pool } from "../config/database";
import { ACTIVE_STATUSES } from "../types/ticket.types";
import { SQL_IS_BREACHED } from "./sla";

/** Statuses that make up the backlog (p.17): work not yet done */
export const BACKLOG_STATUSES = ["New", "Open", "Waiting on employee"];
/** Live = not finished. Pending approval has no due times, so it is never breached. */
const LIVE_STATUSES: string[] = ACTIVE_STATUSES;

/** SQL limiting `column` to the department in parameter $index, or every department when it is null */
const inDepartment = (column: string, index: number) => `($${index}::int IS NULL OR ${column} = $${index}::int)`;

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
const roundOrNull = (value: unknown): number | null =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? null : Math.round(Number(value));

export interface ReportSummary {
  department_id: number | null;
  department_name: string | null;
  days: number;
  backlog: number;
  unassigned: number;
  oldest_unassigned_mins: number | null;
  breached: number;
  breached_first_response: number;
  breached_resolution: number;
  avg_first_response_mins: number | null;
  first_response_within_target_pct: number | null;
  avg_resolution_mins: number | null;
  resolution_within_target_pct: number | null;
  reopen_rate_pct: number | null;
  csat_pct: number | null;
  csat_responses: number;
  pending_approvals: number;
  oldest_pending_approval_mins: number | null;
}

/** The department row, or null when it doesn't exist */
export const findDepartment = async (
  departmentId: number
): Promise<{ department_id: number; department_name: string } | null> => {
  const { rows } = await pool.query("SELECT department_id, department_name FROM department WHERE department_id = $1", [
    departmentId,
  ]);
  return rows[0] ?? null;
};

/** GET /api/reports/summary: the KPI tiles */
export const getReportSummary = async (departmentId: number | null, days: number): Promise<ReportSummary> => {
  const [live, firstResponse, resolution, csat, department] = await Promise.all([
    // Live tickets now: backlog, unassigned (+ oldest), breached (both clocks), pending approvals
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE t.ticket_status::text = ANY($2))::int AS backlog,
         COUNT(*) FILTER (WHERE t.ticket_status::text = ANY($2) AND t.assignee_id IS NULL)::int AS unassigned,
         EXTRACT(EPOCH FROM now() - MIN(t.created_at) FILTER (
           WHERE t.ticket_status::text = ANY($2) AND t.assignee_id IS NULL)) / 60 AS oldest_unassigned_mins,
         COUNT(*) FILTER (WHERE ${SQL_IS_BREACHED})::int AS breached,
         COUNT(*) FILTER (WHERE t.first_response_due_at < COALESCE(t.first_response_at, t.resolved_at, now()))::int
           AS breached_first_response,
         COUNT(*) FILTER (WHERE t.resolution_due_at < COALESCE(t.resolved_at, now()))::int AS breached_resolution,
         COUNT(*) FILTER (WHERE t.ticket_status = 'Pending approval')::int AS pending_approvals,
         EXTRACT(EPOCH FROM now() - MIN(t.created_at) FILTER (WHERE t.ticket_status = 'Pending approval')) / 60
           AS oldest_pending_approval_mins
       FROM ticket t
       WHERE t.deleted_at IS NULL AND t.ticket_status::text = ANY($3) AND ${inDepartment("t.ticket_department_id", 1)}`,
      [departmentId, BACKLOG_STATUSES, LIVE_STATUSES]
    ),
    // Tickets created in the window that have had their first response
    pool.query(
      `SELECT COUNT(*)::int AS responded,
              COUNT(*) FILTER (WHERE t.first_response_at <= t.first_response_due_at)::int AS within_target,
              AVG(EXTRACT(EPOCH FROM t.first_response_at - t.created_at) / 60) AS avg_mins
       FROM ticket t
       WHERE t.deleted_at IS NULL AND t.first_response_at IS NOT NULL
         AND t.created_at >= now() - make_interval(days => $2::int)
         AND ${inDepartment("t.ticket_department_id", 1)}`,
      [departmentId, days]
    ),
    // Tickets resolved in the window: average, within SLA, reopen rate
    pool.query(
      `SELECT COUNT(*)::int AS resolved,
              COUNT(*) FILTER (WHERE t.resolved_at <= t.resolution_due_at)::int AS within_target,
              COUNT(*) FILTER (WHERE t.reopen_count > 0)::int AS reopened,
              AVG(EXTRACT(EPOCH FROM t.resolved_at - t.created_at) / 60) AS avg_mins
       FROM ticket t
       WHERE t.deleted_at IS NULL AND t.resolved_at IS NOT NULL
         AND t.resolved_at >= now() - make_interval(days => $2::int)
         AND ${inDepartment("t.ticket_department_id", 1)}`,
      [departmentId, days]
    ),
    // CSAT: ratings 4-5 / all ratings in the window, by the department at closing time
    pool.query(
      `SELECT COUNT(*)::int AS responses, COUNT(*) FILTER (WHERE f.rating >= 4)::int AS satisfied
       FROM ticket_feedback f
       WHERE f.created_at >= now() - make_interval(days => $2::int)
         AND ${inDepartment("f.department_id", 1)}`,
      [departmentId, days]
    ),
    departmentId === null ? Promise.resolve(null) : findDepartment(departmentId),
  ]);
  const l = live.rows[0];
  const fr = firstResponse.rows[0];
  const rs = resolution.rows[0];
  const cs = csat.rows[0];
  return {
    department_id: departmentId,
    department_name: department?.department_name ?? null,
    days,
    backlog: l.backlog,
    unassigned: l.unassigned,
    oldest_unassigned_mins: roundOrNull(l.oldest_unassigned_mins),
    breached: l.breached,
    breached_first_response: l.breached_first_response,
    breached_resolution: l.breached_resolution,
    avg_first_response_mins: roundOrNull(fr.avg_mins),
    first_response_within_target_pct: pct(fr.within_target, fr.responded),
    avg_resolution_mins: roundOrNull(rs.avg_mins),
    resolution_within_target_pct: pct(rs.within_target, rs.resolved),
    reopen_rate_pct: pct(rs.reopened, rs.resolved),
    csat_pct: pct(cs.satisfied, cs.responses),
    csat_responses: cs.responses,
    pending_approvals: l.pending_approvals,
    oldest_pending_approval_mins: roundOrNull(l.oldest_pending_approval_mins),
  };
};

export interface WorkloadRow {
  user_id: string;
  name: string;
  role: string;
  open: number;
  waiting: number;
  breached: number;
  resolved_7d: number;
  csat_pct: number | null;
}

/**
 * GET /api/reports/workload: one row per active agent of the department, plus its lead, plus anyone
 * else still holding live tickets there. Busiest first.
 *   open = assigned New / Open, waiting = Waiting on employee, breached = their live breached
 *   tickets, resolved_7d = resolved in the last 7 days, csat_pct = 4-5 / all their ratings in the window.
 */
export const getWorkload = async (departmentId: number | null, days: number): Promise<WorkloadRow[]> => {
  const { rows } = await pool.query(
    `WITH people AS (
       SELECT u.user_id FROM users u
       WHERE u.active AND u.role = 'Agent' AND u.department_id IS NOT NULL AND ${inDepartment("u.department_id", 1)}
       UNION
       SELECT d.lead_id FROM department d
       WHERE d.lead_id IS NOT NULL AND ${inDepartment("d.department_id", 1)}
       UNION
       SELECT t.assignee_id FROM ticket t
       WHERE t.assignee_id IS NOT NULL AND t.deleted_at IS NULL AND t.ticket_status::text = ANY($3)
         AND ${inDepartment("t.ticket_department_id", 1)}
     ),
     tickets AS (
       SELECT t.assignee_id,
              COUNT(*) FILTER (WHERE t.ticket_status IN ('New', 'Open'))::int AS open,
              COUNT(*) FILTER (WHERE t.ticket_status = 'Waiting on employee')::int AS waiting,
              COUNT(*) FILTER (WHERE t.ticket_status::text = ANY($3) AND ${SQL_IS_BREACHED})::int AS breached,
              COUNT(*) FILTER (WHERE t.resolved_at >= now() - interval '7 days')::int AS resolved_7d
       FROM ticket t
       WHERE t.assignee_id IS NOT NULL AND t.deleted_at IS NULL AND ${inDepartment("t.ticket_department_id", 1)}
       GROUP BY t.assignee_id
     ),
     ratings AS (
       SELECT f.agent_id, COUNT(*)::int AS responses, COUNT(*) FILTER (WHERE f.rating >= 4)::int AS satisfied
       FROM ticket_feedback f
       WHERE f.agent_id IS NOT NULL AND f.created_at >= now() - make_interval(days => $2::int)
         AND ${inDepartment("f.department_id", 1)}
       GROUP BY f.agent_id
     )
     SELECT u.user_id::text AS user_id, TRIM(CONCAT(u.name, ' ', u.surname)) AS name, u.role,
            COALESCE(tk.open, 0) AS open, COALESCE(tk.waiting, 0) AS waiting,
            COALESCE(tk.breached, 0) AS breached, COALESCE(tk.resolved_7d, 0) AS resolved_7d,
            COALESCE(r.responses, 0) AS responses, COALESCE(r.satisfied, 0) AS satisfied
     FROM people p
     JOIN users u ON u.user_id = p.user_id
     LEFT JOIN tickets tk ON tk.assignee_id = u.user_id
     LEFT JOIN ratings r ON r.agent_id = u.user_id
     ORDER BY COALESCE(tk.open, 0) + COALESCE(tk.waiting, 0) DESC, COALESCE(tk.breached, 0) DESC, name`,
    [departmentId, days, LIVE_STATUSES]
  );
  return rows.map(({ responses, satisfied, ...row }) => ({ ...row, csat_pct: pct(satisfied, responses) }));
};

export interface DailyPoint {
  date: string;
  created: number;
  resolved: number;
}

/** GET /api/reports/daily?days=14: created vs resolved per SAST day, oldest first, every day present */
export const getDaily = async (departmentId: number | null, days: number): Promise<DailyPoint[]> => {
  const { rows } = await pool.query(
    `WITH bounds AS (
       SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date AS today,
              (((now() AT TIME ZONE 'Africa/Johannesburg')::date - ($2::int - 1))::timestamp
                 AT TIME ZONE 'Africa/Johannesburg') AS since
     ),
     series AS (
       SELECT generate_series(b.today - ($2::int - 1), b.today, interval '1 day')::date AS day FROM bounds b
     ),
     created AS (
       SELECT (t.created_at AT TIME ZONE 'Africa/Johannesburg')::date AS day, COUNT(*)::int AS n
       FROM ticket t, bounds b
       WHERE t.deleted_at IS NULL AND t.created_at >= b.since AND ${inDepartment("t.ticket_department_id", 1)}
       GROUP BY 1
     ),
     resolved AS (
       SELECT (t.resolved_at AT TIME ZONE 'Africa/Johannesburg')::date AS day, COUNT(*)::int AS n
       FROM ticket t, bounds b
       WHERE t.deleted_at IS NULL AND t.resolved_at >= b.since AND ${inDepartment("t.ticket_department_id", 1)}
       GROUP BY 1
     )
     SELECT to_char(s.day, 'YYYY-MM-DD') AS date, COALESCE(c.n, 0) AS created, COALESCE(r.n, 0) AS resolved
     FROM series s
     LEFT JOIN created c ON c.day = s.day
     LEFT JOIN resolved r ON r.day = s.day
     ORDER BY s.day`,
    [departmentId, days]
  );
  return rows;
};
