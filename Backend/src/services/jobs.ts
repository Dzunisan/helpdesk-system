// S9 jobs runner (briefing p.18): the work no request does by itself. Vercel Hobby runs cron once a
// day, so runJobs() also runs when a queue or dashboard loads (runJobsSoon, throttled) and from the
// System Admin's "Run jobs now" button (POST /api/admin/jobs/run). Safe to run any number of times:
//   1. auto-close: Resolved tickets past the 5-day window -> Closed + CSAT survey (S2, S10)
//   2. breach alerts: every live ticket past a due time gets ONE sla_breached notification for the
//      department lead (and the owner), stamped with breach_notified_at so it never repeats
//   3. outbox: deliver queued emails (and retry failed ones) after the above committed
import { pool, withTransaction } from "../config/database";
import { SQL_IS_BREACHED } from "./sla";
import { closeExpiredResolved } from "./ticketLifecycle";
import { notify, ticketRef } from "./notify";
import { sendPending, type SendSummary } from "./outbox";

export interface JobsResult {
  /** Resolved tickets closed after 5 days (each also got its CSAT survey) */
  closed: number;
  /** Tickets that raised their one breach alert in this run */
  breach_alerts: number;
  /** What the outbox did with queued emails */
  emails: SendSummary;
  ran_at: string;
}

/** Live work: a breach only matters while someone still owes the employee something */
const LIVE = `t.ticket_status IN ('New', 'Open', 'Waiting on employee')`;

/** Which clock broke, for the notification title */
const breachTitle = (row: { ticket_id: number; first_breached: boolean }) =>
  `${row.first_breached ? "First response" : "Resolution"} breached on ${ticketRef(row.ticket_id)}`;

/**
 * Raises the one-time breach alert for every live, past-due ticket that hasn't had one. Each ticket
 * is stamped and notified in one transaction; SKIP LOCKED lets two runs at once share the work
 * instead of alerting twice.
 */
export const raiseBreachAlerts = async (): Promise<number> =>
  withTransaction(async (client) => {
    const { rows } = await client.query<{
      ticket_id: number;
      title: string;
      assignee_id: string | null;
      lead_id: string | null;
      first_breached: boolean;
      assignee_name: string | null;
    }>(
      `SELECT t.ticket_id, t.title, t.assignee_id::text AS assignee_id, d.lead_id::text AS lead_id,
              (t.first_response_due_at < COALESCE(t.first_response_at, t.resolved_at, now())) AS first_breached,
              NULLIF(TRIM(CONCAT(a.name, ' ', a.surname)), '') AS assignee_name
       FROM ticket t
       JOIN department d ON d.department_id = t.ticket_department_id
       LEFT JOIN users a ON a.user_id = t.assignee_id
       WHERE ${LIVE} AND t.deleted_at IS NULL AND t.breach_notified_at IS NULL AND ${SQL_IS_BREACHED}
       ORDER BY t.ticket_id
       FOR UPDATE OF t SKIP LOCKED`
    );
    for (const row of rows) {
      await client.query(`UPDATE ticket SET breach_notified_at = now() WHERE ticket_id = $1`, [row.ticket_id]);
      await notify(client, {
        userIds: [row.lead_id, row.assignee_id],
        ticketId: row.ticket_id,
        actorId: null,
        type: "sla_breached",
        title: breachTitle(row),
        body: `${row.title} · ${row.assignee_name ?? "Unassigned"}`,
      });
    }
    return rows.length;
  });

/** Runs every job once (see the header) and says what it did */
export const runJobs = async (): Promise<JobsResult> => {
  const closed = await closeExpiredResolved();
  const breachAlerts = await raiseBreachAlerts();
  const emails = await sendPending({ retryFailed: true });
  lastRun = Date.now();
  return { closed, breach_alerts: breachAlerts, emails, ran_at: new Date().toISOString() };
};

/** Queue and dashboard loads run the jobs at most this often */
export const JOBS_THROTTLE_MS = 60_000;
let lastRun = 0;
let inFlight = false;

/**
 * Fire and forget from a read (GET /api/tickets, the S8 reports): runs the jobs when they haven't
 * run in the last minute. Never slows the request down and never fails it.
 */
export const runJobsSoon = (): void => {
  if (inFlight || Date.now() - lastRun < JOBS_THROTTLE_MS) return;
  inFlight = true;
  lastRun = Date.now();
  runJobs()
    .catch((error) => console.error("[jobs] runJobs failed:", error))
    .finally(() => {
      inFlight = false;
    });
};

/** Count of tickets still waiting for their breach alert (for the admin page's "Run jobs now" hint) */
export const pendingBreachAlerts = async (): Promise<number> => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ticket t
     WHERE ${LIVE} AND t.deleted_at IS NULL AND t.breach_notified_at IS NULL AND ${SQL_IS_BREACHED}`
  );
  return rows[0].n;
};
