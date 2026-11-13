// S6 Approvals with a visible reason (briefing p.15, p.56). Contract: docs/api-sprint-2.md "S6".
// The read side for the lead's Approvals screen. The decisions themselves (POST /api/tickets/:id/
// approve | reject) live in services/ticketLifecycle.ts: they write the status change, the public
// `approved` / `rejected` event, the ticket_approval row and the approval_decided notification in
// one transaction.
//
//   Pending  = tickets in 'Pending approval' in a department this lead LEADS (department.lead_id),
//              oldest first. Another department's requests are never listed (a Finance lead never
//              sees IT approvals; approving one is a 404).
//   History  = ticket_approval rows this lead decided, newest first, limited to tickets the lead
//              can still view (a request that later moved to another department is gone, S12).
import { pool } from "../config/database";
import type { Ticket } from "../types/ticket.types";
import { TICKET_JOINS, TICKET_SELECT_FIELDS, withSla } from "./ticketService";
import { TicketAccessUser, departmentsOf, ledDepartmentsOf } from "./ticketAccess";

export type ApprovalDecision = "approved" | "rejected";

export interface ApprovalItem {
  ticket: Ticket;
  decision: ApprovalDecision | null;
  reason: string | null;
  decided_at: string | null;
  approver_id: string | null;
  approver_name: string | null;
  /** Minutes waiting so far (pending) or until the decision (decided) */
  waiting_mins: number;
}

export interface ApprovalPage {
  approvals: ApprovalItem[];
  total: number;
}

const PENDING_WHERE = `t.deleted_at IS NULL AND t.ticket_status = 'Pending approval' AND t.ticket_department_id = ANY($1::int[])`;

/** GET /api/approvals/count: the sidebar's "Approvals (3)" */
export const countPendingApprovals = async (access: TicketAccessUser): Promise<number> => {
  const led = ledDepartmentsOf(access);
  if (!led.length) return 0;
  const { rows } = await pool.query<{ pending: number }>(
    `SELECT COUNT(*)::int AS pending FROM ticket t WHERE ${PENDING_WHERE}`,
    [led]
  );
  return rows[0]?.pending ?? 0;
};

/** Splits a row of TICKET_SELECT_FIELDS + the approval columns (prefixed ap_) into an ApprovalItem */
const toItem = (row: Record<string, any>, now: Date): ApprovalItem => {
  const { ap_decision, ap_reason, ap_decided_at, ap_approver_id, ap_approver_name, ap_waiting_mins, ...ticket } = row;
  return {
    ticket: withSla(ticket as Ticket, now),
    decision: ap_decision ?? null,
    reason: ap_reason ?? null,
    decided_at: ap_decided_at ?? null,
    approver_id: ap_approver_id ?? null,
    approver_name: ap_approver_name ?? null,
    waiting_mins: Math.max(0, Number(ap_waiting_mins) || 0),
  };
};

/** GET /api/approvals?status=pending: the lead's queue, oldest request first */
export const listPendingApprovals = async (
  access: TicketAccessUser,
  page: number,
  limit: number
): Promise<ApprovalPage> => {
  const led = ledDepartmentsOf(access);
  if (!led.length) return { approvals: [], total: 0 };
  const count = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM ticket t WHERE ${PENDING_WHERE}`,
    [led]
  );
  const { rows } = await pool.query(
    `SELECT ${TICKET_SELECT_FIELDS},
            NULL::text AS ap_decision, NULL::text AS ap_reason, NULL::timestamptz AS ap_decided_at,
            NULL::text AS ap_approver_id, NULL::text AS ap_approver_name,
            FLOOR(EXTRACT(EPOCH FROM (now() - t.created_at)) / 60)::int AS ap_waiting_mins
     FROM ticket t
     ${TICKET_JOINS}
     WHERE ${PENDING_WHERE}
     ORDER BY t.created_at ASC, t.ticket_id ASC
     LIMIT $2 OFFSET $3`,
    [led, limit, (page - 1) * limit]
  );
  const now = new Date();
  return { approvals: rows.map((row) => toItem(row, now)), total: count.rows[0]?.total ?? 0 };
};

/** GET /api/approvals?decided_by=me: the History tab, newest decision first */
export const listMyDecisions = async (
  access: TicketAccessUser,
  page: number,
  limit: number
): Promise<ApprovalPage> => {
  // Only tickets this lead may still view (ticketAccess: their departments, or their own request)
  const where = `a.approver_id = $1 AND t.deleted_at IS NULL
    AND (t.ticket_department_id = ANY($2::int[]) OR t.requester_id = $1)`;
  const values: unknown[] = [String(access.user_id), departmentsOf(access)];
  const count = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM ticket_approval a JOIN ticket t ON t.ticket_id = a.ticket_id WHERE ${where}`,
    values
  );
  const { rows } = await pool.query(
    `SELECT ${TICKET_SELECT_FIELDS},
            a.decision AS ap_decision, a.reason AS ap_reason, a.decided_at AS ap_decided_at,
            a.approver_id::text AS ap_approver_id,
            NULLIF(TRIM(CONCAT(apr.name, ' ', apr.surname)), '') AS ap_approver_name,
            FLOOR(EXTRACT(EPOCH FROM (a.decided_at - t.created_at)) / 60)::int AS ap_waiting_mins
     FROM ticket_approval a
     JOIN ticket t ON t.ticket_id = a.ticket_id
     ${TICKET_JOINS}
     LEFT JOIN users apr ON apr.user_id = a.approver_id
     WHERE ${where}
     ORDER BY a.decided_at DESC, a.approval_id DESC
     LIMIT $3 OFFSET $4`,
    [...values, limit, (page - 1) * limit]
  );
  const now = new Date();
  return { approvals: rows.map((row) => toItem(row, now)), total: count.rows[0]?.total ?? 0 };
};
