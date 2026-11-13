// S10 CSAT survey (briefing p.19, p.43, p.53). Contract: docs/api-sprint-2.md "S10".
//   - The survey is requested when a ticket closes (services/notify.ts requestCsat(), already called
//     by the employee's "Yes, it's fixed" and by the 5-day auto-close).
//   - ONE rating per ticket, by the requester only, once the ticket is Closed. A second submit is 409
//     (no upsert: INSERT ... ON CONFLICT DO NOTHING). The agent and department at closing time are
//     stored with the rating, so a later reassignment or move doesn't move the score.
//   - A 1 or 2 star rating notifies the department lead (S9 low_csat), in the same transaction.
//   - The report: % of 4-5 star ratings by agent and department + recent feedback, a lead only
//     ever for the department(s) they lead.
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database";
import { HttpError } from "../utils/httpError";
import type { User } from "../types/user.types";
import { logEvent } from "./events";
import { departmentLeadId, notify, ticketRef } from "./notify";
import { sendPendingSoon } from "./outbox";
import { closeExpiredResolved } from "./ticketLifecycle";
import { canView, isRequester, loadTicketAccess, TICKET_NOT_FOUND } from "./ticketAccess";
import { runJobsSoon } from "./jobs";

/** Quick tags on the survey (p.19, p.43) */
export const CSAT_TAGS = ["Fast reply", "Kept me updated", "Fixed first time", "Friendly"] as const;
export type CsatTag = (typeof CSAT_TAGS)[number];

export const MAX_COMMENT = 2000;
export const ALREADY_RATED = "Thanks, you already rated this.";

export interface TicketFeedback {
  feedback_id: number;
  ticket_id: number;
  user_id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  agent_id: string | null;
  agent_name: string | null;
  department_id: number | null;
  created_at: Date;
  updated_at: Date;
  user_name: string | null;
}

const FEEDBACK_SELECT = `
  SELECT fb.feedback_id, fb.ticket_id, fb.user_id::text AS user_id, fb.rating, fb.comment, fb.tags,
         fb.agent_id::text AS agent_id, NULLIF(TRIM(CONCAT(a.name, ' ', a.surname)), '') AS agent_name,
         fb.department_id, fb.created_at, fb.updated_at,
         NULLIF(TRIM(CONCAT(u.name, ' ', u.surname)), '') AS user_name
  FROM ticket_feedback fb
  LEFT JOIN users u ON u.user_id = fb.user_id
  LEFT JOIN users a ON a.user_id = fb.agent_id`;

const loadFeedback = async (db: PoolClient | typeof pool, ticketId: number): Promise<TicketFeedback | null> => {
  const { rows } = await db.query<TicketFeedback>(`${FEEDBACK_SELECT} WHERE fb.ticket_id = $1`, [ticketId]);
  return rows[0] ?? null;
};

interface FeedbackTicket {
  ticket_id: number;
  title: string;
  requester_id: string;
  assignee_id: string | null;
  ticket_department_id: number | null;
  ticket_status: string;
}

const TICKET_SELECT = `
  SELECT ticket_id, title, requester_id::text AS requester_id, assignee_id::text AS assignee_id,
         ticket_department_id, ticket_status::text AS ticket_status
  FROM ticket WHERE ticket_id = $1 AND deleted_at IS NULL`;

/** GET /api/tickets/:id/feedback: the requester or staff of the department (404 everyone else) */
export const getFeedback = async (ticketId: number, user: User): Promise<TicketFeedback | null> => {
  // "Checked on read" (p.19): a Resolved ticket past its 5 days closes now and gets its survey
  await closeExpiredResolved(ticketId);
  const { rows } = await pool.query<FeedbackTicket>(TICKET_SELECT, [ticketId]);
  const ticket = rows[0];
  const access = await loadTicketAccess(user);
  if (!ticket || !canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
  return loadFeedback(pool, ticketId);
};

/** Checks { rating, tags, comment }; 400 with a sentence the survey can show */
export const parseFeedbackInput = (body: unknown): { rating: number; tags: CsatTag[]; comment: string | null } => {
  const input = (body ?? {}) as { rating?: unknown; tags?: unknown; comment?: unknown; feedback?: unknown };
  // A JSON number only: "5" (a string) is a 400 like 3.5, 0 and 6
  const rating = typeof input.rating === "number" ? input.rating : NaN;
  if (input.rating === undefined || input.rating === null || input.rating === "") {
    throw new HttpError(400, "Choose a rating from 1 to 5 stars.");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpError(400, "Rating must be a whole number from 1 to 5.");
  }

  let tags: CsatTag[] = [];
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) throw new HttpError(400, "Tags must be a list.");
    for (const tag of input.tags) {
      if (typeof tag !== "string" || !(CSAT_TAGS as readonly string[]).includes(tag)) {
        throw new HttpError(400, `Unknown tag: ${String(tag)}. Choose from ${CSAT_TAGS.join(", ")}.`);
      }
    }
    tags = [...new Set(input.tags as CsatTag[])];
  }

  // `feedback` is the Sprint 1 name for the comment
  const raw = input.comment !== undefined ? input.comment : input.feedback;
  let comment: string | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "string") throw new HttpError(400, "The comment must be text.");
    const trimmed = raw.trim();
    if (trimmed.length > MAX_COMMENT) throw new HttpError(400, `The comment can be at most ${MAX_COMMENT} characters.`);
    comment = trimmed || null;
  }
  return { rating, tags, comment };
};

const stars = (n: number) => `${n} star${n === 1 ? "" : "s"}`;

/**
 * POST /api/tickets/:id/feedback { rating, tags?, comment? }: once, by the requester, on a Closed
 * ticket. 404 can't see it, 403 staff (Thabo can't rate his own work), 409 already rated or not
 * Closed, 400 bad input. Rating + feedback_given event + low_csat notification commit together.
 */
export const submitFeedback = async (ticketId: number, user: User, body: unknown): Promise<TicketFeedback> => {
  await closeExpiredResolved(ticketId);
  const access = await loadTicketAccess(user);

  const feedback = await withTransaction(async (client) => {
    const { rows } = await client.query<FeedbackTicket>(`${TICKET_SELECT} FOR UPDATE`, [ticketId]);
    const ticket = rows[0];
    if (!ticket || !canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
    if (!isRequester(access, ticket)) {
      throw new HttpError(403, "Only the person who raised this request can rate it.");
    }
    const existing = await client.query(`SELECT 1 FROM ticket_feedback WHERE ticket_id = $1`, [ticketId]);
    if (existing.rowCount) throw new HttpError(409, ALREADY_RATED);
    if (ticket.ticket_status !== "Closed") {
      throw new HttpError(409, `You can rate this request once it's closed. It's ${ticket.ticket_status} now.`);
    }
    const { rating, tags, comment } = parseFeedbackInput(body);

    // The agent and department now (the ticket is Closed, so this is closing time)
    const saved = await client.query<{ feedback_id: number }>(
      `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment, tags, agent_id, department_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (ticket_id) DO NOTHING
       RETURNING feedback_id`,
      [ticketId, user.user_id, rating, comment, tags, ticket.assignee_id, ticket.ticket_department_id]
    );
    if (!saved.rowCount) throw new HttpError(409, ALREADY_RATED);

    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "feedback_given",
      to: String(rating),
      note: comment,
    });

    // S9: a 1-2 star rating goes to the department lead (never to the person who rated)
    if (rating <= 2) {
      const leadId = await departmentLeadId(client, ticket.ticket_department_id);
      const name = `${user.name} ${user.surname ?? ""}`.trim();
      await notify(client, {
        userIds: [leadId],
        ticketId,
        actorId: user.user_id,
        type: "low_csat",
        title: `${name} rated ${ticketRef(ticketId)} ${stars(rating)}`,
        body: comment ?? (tags.length ? tags.join(", ") : ticket.title),
      });
    }
    return (await loadFeedback(client, ticketId))!;
  });

  sendPendingSoon();
  return feedback;
};

// ---------------------------------------------------------------------------------------------
// GET /api/reports/csat?days=30
// ---------------------------------------------------------------------------------------------

export interface CsatReport {
  department_id: number | null;
  days: number;
  responses: number;
  csat_pct: number | null;
  avg_rating: number | null;
  distribution: [number, number, number, number, number];
  by_agent: Array<{ user_id: string; name: string; responses: number; csat_pct: number | null; avg_rating: number | null }>;
  recent: Array<{
    feedback_id: number;
    ticket_id: number;
    ticket_title: string;
    rating: number;
    comment: string | null;
    tags: string[];
    requester_name: string | null;
    agent_id: string | null;
    agent_name: string | null;
    created_at: Date;
  }>;
}

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;
const RECENT_LIMIT = 10;

/** % of ratings that are 4 or 5 stars, a whole number; null when nobody rated */
const PCT = `CASE WHEN COUNT(*) = 0 THEN NULL
              ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE fb.rating >= 4) / COUNT(*))::int END`;
const AVG = `ROUND(AVG(fb.rating)::numeric, 1)::float8`;

/**
 * The CSAT report. A Department Lead always gets the department(s) they lead (any department_id
 * sent is ignored); a System Admin gets ?department_id= or every department, as aggregates only
 * (no ticket titles or comments: recent is empty). Window: ratings given in the last `days` days.
 */
export const csatReport = async (
  user: User,
  options: { days: number; departmentId: number | null }
): Promise<CsatReport> => {
  runJobsSoon();
  let departmentIds: number[] | null = null;
  let departmentId: number | null = null;
  const lead = user.role === "Department Lead";
  if (lead) {
    const access = await loadTicketAccess(user);
    departmentIds = access.led_department_ids?.length
      ? access.led_department_ids
      : user.department_id !== null && user.department_id !== undefined
        ? [Number(user.department_id)]
        : [];
    departmentId = departmentIds.length === 1 ? departmentIds[0] : null;
  } else if (options.departmentId !== null) {
    const { rowCount } = await pool.query(`SELECT 1 FROM department WHERE department_id = $1`, [options.departmentId]);
    if (!rowCount) throw new HttpError(404, "Department not found.");
    departmentIds = [options.departmentId];
    departmentId = options.departmentId;
  }

  const where = `fb.created_at >= now() - make_interval(days => $1::int)
                 AND ($2::int[] IS NULL OR fb.department_id = ANY($2::int[]))`;
  const values = [options.days, departmentIds];

  const totals = await pool.query<{
    responses: number;
    csat_pct: number | null;
    avg_rating: number | null;
    d1: number; d2: number; d3: number; d4: number; d5: number;
  }>(
    `SELECT COUNT(*)::int AS responses, ${PCT} AS csat_pct, ${AVG} AS avg_rating,
            COUNT(*) FILTER (WHERE fb.rating = 1)::int AS d1, COUNT(*) FILTER (WHERE fb.rating = 2)::int AS d2,
            COUNT(*) FILTER (WHERE fb.rating = 3)::int AS d3, COUNT(*) FILTER (WHERE fb.rating = 4)::int AS d4,
            COUNT(*) FILTER (WHERE fb.rating = 5)::int AS d5
     FROM ticket_feedback fb WHERE ${where}`,
    values
  );
  const t = totals.rows[0];

  const byAgent = await pool.query(
    `SELECT fb.agent_id::text AS user_id, TRIM(CONCAT(a.name, ' ', a.surname)) AS name,
            COUNT(*)::int AS responses, ${PCT} AS csat_pct, ${AVG} AS avg_rating
     FROM ticket_feedback fb
     JOIN users a ON a.user_id = fb.agent_id
     WHERE ${where}
     GROUP BY fb.agent_id, a.name, a.surname
     ORDER BY responses DESC, name`,
    values
  );

  // Recent feedback is ticket content: leads only (p.17, p.60: the System Admin sees counts)
  const recent = lead
    ? (
        await pool.query(
          `SELECT fb.feedback_id, fb.ticket_id, t.title AS ticket_title, fb.rating, fb.comment, fb.tags,
                  NULLIF(TRIM(CONCAT(r.name, ' ', r.surname)), '') AS requester_name,
                  fb.agent_id::text AS agent_id, NULLIF(TRIM(CONCAT(a.name, ' ', a.surname)), '') AS agent_name,
                  fb.created_at
           FROM ticket_feedback fb
           JOIN ticket t ON t.ticket_id = fb.ticket_id
           LEFT JOIN users r ON r.user_id = fb.user_id
           LEFT JOIN users a ON a.user_id = fb.agent_id
           WHERE ${where}
           ORDER BY fb.created_at DESC, fb.feedback_id DESC
           LIMIT ${RECENT_LIMIT}`,
          values
        )
      ).rows
    : [];

  return {
    department_id: departmentId,
    days: options.days,
    responses: t.responses,
    csat_pct: t.csat_pct,
    avg_rating: t.avg_rating,
    distribution: [t.d1, t.d2, t.d3, t.d4, t.d5],
    by_agent: byAgent.rows,
    recent,
  };
};
