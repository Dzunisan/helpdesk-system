import { pool, query, withTransaction } from "../config/database";
import {
  Ticket,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  CreateTicketDto,
  UpdateTicketDto,
  PaginatedTicketsResult,
  TicketComment,
  TicketFeedback
} from "../types/ticket.types";
import { logEvent } from "./events";
import { DUE_SOON_SHARE, SQL_IS_BREACHED, SQL_NEXT_DUE, computeDueTimes, loadSlaPolicies, slaState } from "./sla";
import { User } from "../types/user.types";
import {
  TicketAccessUser,
  loadTicketAccess,
  canView,
  canWork,
  isRequester,
  ticketScopeCondition
} from "./ticketAccess";

const TICKET_SELECT_FIELDS = `
  t.ticket_id,
  t.title,
  t.description,
  t.ticket_department_id,
  t.ticket_category_id,
  t.ticket_priority,
  t.ticket_status,
  t.impact,
  t.extra_fields,
  t.requester_id::text AS requester_id,
  t.assignee_id::text AS assignee_id,
  t.created_at,
  t.updated_at,
  t.deleted_at,
  t.resolved_at,
  t.closed_at,
  t.reopen_count,
  t.resolution_note,
  t.first_response_due_at,
  t.resolution_due_at,
  t.first_response_at,
  d.department_name,
  c.category_name,
  c.icon AS category_icon,
  c.kind AS category_kind,
  TRIM(CONCAT(req_u.name, ' ', req_u.surname)) AS requester_name,
  req_u.email AS requester_email,
  TRIM(CONCAT(asg_u.name, ' ', asg_u.surname)) AS assignee_name,
  asg_u.email AS assignee_email
`;

const TICKET_JOINS = `
  LEFT JOIN department d ON t.ticket_department_id = d.department_id
  LEFT JOIN category c ON t.ticket_category_id = c.category_id
  LEFT JOIN users req_u ON t.requester_id = req_u.user_id
  LEFT JOIN users asg_u ON t.assignee_id = asg_u.user_id
`;

/** Comment columns (S4); the body of a deleted comment never leaves the database */
export const COMMENT_SELECT = `
  SELECT c.comment_id, c.ticket_id, c.author_id::text AS author_id,
         TRIM(CONCAT(u.name, ' ', u.surname)) AS author_name,
         u.email AS author_email, u.role AS author_role, ud.department_name AS author_department_name,
         CASE WHEN c.deleted_at IS NULL THEN c.body END AS body,
         c.is_internal, c.created_at, c.edited_at, c.deleted_at
  FROM comment c
  LEFT JOIN users u ON u.user_id = c.author_id
  LEFT JOIN department ud ON ud.department_id = u.department_id`;

export const checkDepartmentExists =async (departmentId: number): Promise<boolean> => {
  const result = await query("SELECT 1 FROM department WHERE department_id = $1", [departmentId]);
  return (result.rowCount ?? 0) > 0;
};

export const checkUserExists = async (userId: string | number): Promise<boolean> => {
  const result = await query("SELECT 1 FROM users WHERE user_id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
};

export const checkCategoryExists = async (categoryId: number): Promise<boolean> => {
  const result = await query("SELECT 1 FROM category WHERE category_id = $1", [categoryId]);
  return (result.rowCount ?? 0) > 0;
};

/** What a category decides about a new ticket (briefing p.14 S5): department, priority, approval */
export interface CategoryRouting {
  category_id: number;
  category_name: string;
  department_id: number;
  default_priority: TicketPriority;
  needs_approval: boolean;
  active: boolean;
  fields: unknown[];
}

export const getCategoryRouting = async (categoryId: number): Promise<CategoryRouting | null> => {
  const result = await query(
    `SELECT category_id, category_name, department_id, default_priority, needs_approval, active, fields
     FROM category WHERE category_id = $1`,
    [categoryId]
  );
  return result.rows[0] ?? null;
};

// LEGACY BRIDGE until S5 ships the category form: the old request form only sends a department, so
// its ticket goes to that department's "Something else" category (else its first active category).
export const getFallbackCategoryId = async (departmentId: number): Promise<number | null> => {
  const result = await query(
    `SELECT category_id FROM category
     WHERE department_id = $1 AND active AND NOT needs_approval
     ORDER BY (category_name = 'Something else') DESC, (kind = 'fix') DESC, category_id
     LIMIT 1`,
    [departmentId]
  );
  return result.rows[0]?.category_id ?? null;
};

// Inserts the ticket with both SLA due times and its "created" event in one transaction
export const createTicket = async (dto: CreateTicketDto): Promise<Ticket> => {
  const ticketId = await withTransaction(async (client) => {
    const policies = await loadSlaPolicies(client);
    const now = new Date();
    // Pending approval has no clock yet: the team can't act until the lead approves (S6 sets them then)
    const due =
      dto.status === "Pending approval"
        ? { first_response_due_at: null, resolution_due_at: null }
        : computeDueTimes(now, dto.priority, policies);
    const insertResult = await client.query(
      `INSERT INTO ticket (
        title, description, ticket_department_id, ticket_category_id, ticket_priority, ticket_status,
        impact, extra_fields, requester_id, first_response_due_at, resolution_due_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      RETURNING ticket_id`,
      [
        dto.title,
        dto.description ?? null,
        dto.department_id,
        dto.category_id,
        dto.priority,
        dto.status,
        dto.impact ?? null,
        JSON.stringify(dto.extra_fields ?? {}),
        dto.requester_id,
        due.first_response_due_at,
        due.resolution_due_at,
        now
      ]
    );
    const id: number = insertResult.rows[0].ticket_id;
    await logEvent(client, { ticketId: id, actorId: dto.requester_id, type: "created", to: dto.status });
    return id;
  });

  const fullTicket = await getTicketById(ticketId, false);
  return fullTicket!;
};

/** Adds the computed sla_state to a ticket row */
const withSla = <T extends Ticket>(ticket: T, now = new Date()): T => ({ ...ticket, sla_state: slaState(ticket, now) });

/** GET /api/tickets query, already validated by the controller (docs/api-sprint-1.md "S1") */
export interface TicketListFilters {
  statuses?: TicketStatus[];
  priorities?: TicketPriority[];
  /** Employees only: Agents and Leads get their department from the role */
  department_id?: number | null;
  /** Staff only */
  creator_id?: string | null;
  /** A user id, or "none" for unassigned ("me" is resolved by the controller) */
  assignee_id?: string | null;
  category_id?: number | null;
  search?: string | null;
  sort?: "due" | "created" | "updated";
  sla?: "breached" | "due_soon" | null;
  page: number;
  limit: number;
}

/**
 * "Due soon" as SQL (alias t): no clock breached, and a running clock has under 25% of its target
 * left. Mirrors slaState() in services/sla.ts.
 */
const SQL_IS_DUE_SOON = `(NOT ${SQL_IS_BREACHED}
  AND t.resolved_at IS NULL
  AND t.ticket_status NOT IN ('Closed', 'Cancelled')
  AND (
    (t.first_response_at IS NULL AND t.first_response_due_at > t.created_at
      AND t.first_response_due_at - now() < (t.first_response_due_at - t.created_at) * ${DUE_SOON_SHARE})
    OR (t.resolution_due_at > t.created_at
      AND t.resolution_due_at - now() < (t.resolution_due_at - t.created_at) * ${DUE_SOON_SHARE})
  ))`;

const ORDER_BY: Record<NonNullable<TicketListFilters["sort"]>, string> = {
  // Nearest unmet due time first: breached tickets (due in the past) lead, finished ones go last
  due: `${SQL_NEXT_DUE} ASC NULLS LAST, t.created_at ASC, t.ticket_id ASC`,
  created: "t.created_at DESC, t.ticket_id DESC",
  updated: "t.updated_at DESC, t.ticket_id DESC",
};

export const getTickets = async (
  filters: TicketListFilters,
  access: TicketAccessUser
): Promise<PaginatedTicketsResult> => {
  const { page, limit } = filters;
  const conditions: string[] = ["t.deleted_at IS NULL"];
  const values: unknown[] = [];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  // Access scope from ticketAccess: the role decides which tickets are listed, not the browser
  const scope = ticketScopeCondition(access, 1);
  if (!scope) {
    return { tickets: [], total: 0 };
  }
  conditions.push(scope.sql);
  values.push(...scope.values);

  if (access.role !== "Employee" && filters.creator_id) {
    conditions.push(`t.requester_id = ${param(filters.creator_id)}`);
  }
  if (filters.statuses?.length) {
    conditions.push(`t.ticket_status::text = ANY(${param(filters.statuses)}::text[])`);
  }
  if (filters.priorities?.length) {
    conditions.push(`t.ticket_priority::text = ANY(${param(filters.priorities)}::text[])`);
  }
  if (filters.department_id !== undefined && filters.department_id !== null) {
    conditions.push(`t.ticket_department_id = ${param(filters.department_id)}`);
  }
  if (filters.assignee_id === "none") {
    conditions.push("t.assignee_id IS NULL");
  } else if (filters.assignee_id) {
    conditions.push(`t.assignee_id = ${param(filters.assignee_id)}`);
  }
  if (filters.category_id !== undefined && filters.category_id !== null) {
    conditions.push(`t.ticket_category_id = ${param(filters.category_id)}`);
  }
  // Title, description, requester name, or the reference: "HD-1048" / "1048"
  const search = filters.search?.trim();
  if (search) {
    const like = param(`%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    const ref = /^(?:hd-?)?(\d{1,9})$/i.exec(search);
    const refCondition = ref ? ` OR t.ticket_id = ${param(Number(ref[1]))}` : "";
    conditions.push(
      `(t.title ILIKE ${like} OR t.description ILIKE ${like} OR CONCAT(req_u.name, ' ', req_u.surname) ILIKE ${like}${refCondition})`
    );
  }
  if (filters.sla === "breached") conditions.push(SQL_IS_BREACHED);
  if (filters.sla === "due_soon") conditions.push(SQL_IS_DUE_SOON);

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ticket t ${TICKET_JOINS} ${whereClause}`,
    values
  );
  const total = countResult.rows[0]?.total || 0;

  const offset = (page - 1) * limit;
  const dataResult = await pool.query(
    `SELECT ${TICKET_SELECT_FIELDS}
     FROM ticket t
     ${TICKET_JOINS}
     ${whereClause}
     ORDER BY ${ORDER_BY[filters.sort ?? "created"]}
     LIMIT ${param(limit)} OFFSET ${param(offset)}`,
    values
  );
  const now = new Date();
  return { tickets: dataResult.rows.map((t: Ticket) => withSla(t, now)), total };
};

// includeInternal: only staff who can work the ticket (ticketAccess.canWork) see internal notes.
export const getTicketById = async (
  ticketId: number,
  includeInternal = false,
  includeDeleted = false
): Promise<TicketDetail | null> => {
  const whereDeleted = includeDeleted ? "" : "AND t.deleted_at IS NULL";
  const result = await pool.query(
    `SELECT ${TICKET_SELECT_FIELDS}
     FROM ticket t
     ${TICKET_JOINS}
     WHERE t.ticket_id = $1 ${whereDeleted}`,
    [ticketId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const ticket: TicketDetail = withSla(result.rows[0]);

  // Fetch comments: requesters only see public comments; department staff see internal notes too
  // (a deleted comment keeps its place with body null: "Message removed by <name>")
  const commentFilter = includeInternal ? "" : "AND c.is_internal = false";
  const commentsResult = await pool.query(
    `${COMMENT_SELECT}
     WHERE c.ticket_id = $1 ${commentFilter}
     ORDER BY c.created_at ASC, c.comment_id ASC`,
    [ticketId]
  );
  ticket.comments = commentsResult.rows as TicketComment[];

  // Fetch resolution feedback if any
  const feedbackResult = await pool.query(
    `SELECT fb.feedback_id, fb.ticket_id, fb.user_id, fb.rating, fb.comment, fb.created_at, fb.updated_at,
            TRIM(CONCAT(u.name, ' ', u.surname)) AS user_name,
            u.email AS user_email
     FROM ticket_feedback fb
     LEFT JOIN users u ON fb.user_id = u.user_id
     WHERE fb.ticket_id = $1`,
    [ticketId]
  );
  ticket.feedback = feedbackResult.rows[0] ? (feedbackResult.rows[0] as TicketFeedback) : null;

  return ticket;
};

export interface ResolvedTicketAccess {
  ticket: {
    ticket_id: number;
    title: string;
    requester_id: string | null;
    assignee_id: string | null;
    ticket_department_id: number | null;
    ticket_status: TicketStatus;
  };
  access: TicketAccessUser;
  canWork: boolean;
  isRequester: boolean;
}

// Loads a (non-deleted) ticket and checks it against ticketAccess. Returns null when the ticket
// does not exist OR the user may not view it: callers answer both with 404 "Ticket not found."
export const resolveTicketAccess = async (
  ticketId: number,
  currentUser: User | TicketAccessUser
): Promise<ResolvedTicketAccess | null> => {
  const result = await pool.query(
    `SELECT ticket_id, title, requester_id, assignee_id, ticket_department_id, ticket_status
     FROM ticket
     WHERE ticket_id = $1 AND deleted_at IS NULL`,
    [ticketId]
  );
  if (result.rowCount === 0) return null;

  const ticket = result.rows[0];
  const access = await loadTicketAccess(currentUser);
  if (!canView(access, ticket)) return null;

  return {
    ticket,
    access,
    canWork: canWork(access, ticket),
    isRequester: isRequester(access, ticket)
  };
};

export const updateTicket = async (
  ticketId: number,
  updateData: UpdateTicketDto,
  includeInternal = false
): Promise<Ticket | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updateData.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(updateData.title);
  }
  if (updateData.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(updateData.description);
  }
  // Status and priority never change here: POST /:id/transition and PATCH /:id/priority enforce the
  // rules and write the timeline event
  if (updateData.department_id !== undefined) {
    fields.push(`ticket_department_id = $${paramIndex++}`);
    values.push(updateData.department_id);
  }
  if (updateData.category_id !== undefined) {
    fields.push(`ticket_category_id = $${paramIndex++}`);
    values.push(updateData.category_id);
  }

  if (fields.length === 0) {
    return getTicketById(ticketId, includeInternal);
  }

  fields.push(`updated_at = NOW()`);
  values.push(ticketId);

  const updateQuery = `
    UPDATE ticket
    SET ${fields.join(", ")}
    WHERE ticket_id = $${paramIndex}
    RETURNING ticket_id
  `;

  const result = await pool.query(updateQuery, values);
  if (result.rowCount === 0) {
    return null;
  }

  return getTicketById(ticketId, includeInternal);
};

export const submitTicketFeedback = async (
  ticketId: number,
  currentUser: User,
  rating: number,
  comment?: string | null
): Promise<{ success: boolean; statusCode: number; message: string; feedback?: TicketFeedback }> => {
  const ticketRes = await pool.query(
    "SELECT ticket_id, requester_id, ticket_status, title FROM ticket WHERE ticket_id = $1 AND deleted_at IS NULL",
    [ticketId]
  );

  if (ticketRes.rowCount === 0) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  const ticket = ticketRes.rows[0];

  // ticketAccess: 404 for anyone who can't view the ticket
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // RBAC: Only ticket requester can submit resolution feedback
  if (!resolved.isRequester) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: Only the ticket requester can submit resolution feedback."
    };
  }

  // Resolution feedback requirement: Requester can post rating/feedback only after a ticket is marked as Resolved or Closed.
  const normalizedStatus = String(ticket.ticket_status).trim().toLowerCase();
  if (normalizedStatus !== "resolved" && normalizedStatus !== "closed") {
    return {
      success: false,
      statusCode: 400,
      message: `Feedback can only be submitted for tickets that are Resolved or Closed. Current status is ${ticket.ticket_status}.`
    };
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return {
      success: false,
      statusCode: 400,
      message: "Rating must be an integer between 1 and 5."
    };
  }

  const trimmedComment = comment !== undefined && comment !== null ? String(comment).trim() : null;

  const result = await pool.query(
    `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (ticket_id) DO UPDATE
     SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()
     RETURNING feedback_id, ticket_id, user_id, rating, comment, created_at, updated_at`,
    [ticketId, currentUser.user_id, ratingNum, trimmedComment]
  );

  const fb = result.rows[0] as TicketFeedback;
  fb.user_name = `${currentUser.name} ${currentUser.surname || ""}`.trim();
  fb.user_email = currentUser.email;

  return {
    success: true,
    statusCode: 201,
    message: "Feedback submitted successfully.",
    feedback: fb
  };
};

export const getTicketFeedback = async (
  ticketId: number,
  currentUser: User
): Promise<{ success: boolean; statusCode: number; message: string; feedback?: TicketFeedback | null }> => {
  // ticketAccess: feedback is readable only by the requester or staff of the ticket's department
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  const result = await pool.query(
    `SELECT fb.feedback_id, fb.ticket_id, fb.user_id, fb.rating, fb.comment, fb.created_at, fb.updated_at,
            TRIM(CONCAT(u.name, ' ', u.surname)) AS user_name,
            u.email AS user_email
     FROM ticket_feedback fb
     LEFT JOIN users u ON fb.user_id = u.user_id
     WHERE fb.ticket_id = $1`,
    [ticketId]
  );

  return {
    success: true,
    statusCode: 200,
    message: "Feedback retrieved successfully",
    feedback: result.rows[0] ? (result.rows[0] as TicketFeedback) : null
  };
};

// Active agents and leads of the given departments (members, plus each department's lead)
export const getAvailableAgents = async (departmentIds: number[]) => {
  if (departmentIds.length === 0) return [];
  const conditions = [
    "u.active = true",
    "u.role IN ('Agent', 'Department Lead')",
    "(u.department_id = ANY($1::int[]) OR u.user_id IN (SELECT lead_id FROM department WHERE department_id = ANY($1::int[])))"
  ];
  const params: any[] = [departmentIds];

  const res = await pool.query(
    `SELECT u.user_id, u.name, u.surname, u.email, u.role, u.department_id, d.department_name
     FROM users u
     LEFT JOIN department d ON u.department_id = d.department_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.name ASC, u.surname ASC`,
    params
  );

  return res.rows;
};

