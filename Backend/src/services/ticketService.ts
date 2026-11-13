import { pool, query, withTransaction } from "../config/database";
import {
  Ticket,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  CreateTicketDto,
  UpdateTicketDto,
  TicketFilters,
  PaginatedTicketsResult,
  TicketComment,
  TicketFeedback
} from "../types/ticket.types";
import { logEvent } from "./events";
import { computeDueTimes, loadSlaPolicies, slaState } from "./sla";
import { User } from "../types/user.types";
import {
  sendTicketAssignedEmail,
  sendTicketCommentEmail,
  sendTicketStatusEmail
} from "../utils/emailService";
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

export const checkDepartmentExists = async (departmentId: number): Promise<boolean> => {
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

export const getTickets = async (
  filters: TicketFilters,
  access: TicketAccessUser
): Promise<PaginatedTicketsResult> => {
  const {
    status,
    priority,
    department_id,
    creator_id,
    assignee_id,
    search,
    page = 1,
    limit = 10,
    include_deleted = false,
  } = filters;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Soft deletion filtering
  if (!include_deleted) {
    conditions.push("t.deleted_at IS NULL");
  }

  // Access scope from ticketAccess: the role decides which tickets are listed, not the browser
  const scope = ticketScopeCondition(access, paramIndex);
  if (!scope) {
    return { tickets: [], total: 0 };
  }
  conditions.push(scope.sql);
  values.push(...scope.values);
  paramIndex += scope.values.length;

  // Staff can narrow their scoped list to a specific requester
  if (access.role !== "Employee" && creator_id) {
    conditions.push(`t.requester_id = $${paramIndex++}`);
    values.push(creator_id);
  }

  // Filter by status
  if (status) {
    conditions.push(`LOWER(t.ticket_status::text) = LOWER($${paramIndex++})`);
    values.push(status);
  }

  // Filter by priority
  if (priority) {
    conditions.push(`LOWER(t.ticket_priority::text) = LOWER($${paramIndex++})`);
    values.push(priority);
  }

  // Filter by department
  if (department_id !== undefined && department_id !== null) {
    conditions.push(`t.ticket_department_id = $${paramIndex++}`);
    values.push(department_id);
  }

  // Filter by assignee
  if (assignee_id) {
    conditions.push(`t.assignee_id = $${paramIndex++}`);
    values.push(assignee_id);
  }

  // Search by title or description
  if (search && search.trim().length > 0) {
    conditions.push(`(t.title ILIKE '%' || $${paramIndex} || '%' OR t.description ILIKE '%' || $${paramIndex} || '%')`);
    values.push(search.trim());
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ticket t
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0]?.total || 0;

  // Data query with pagination
  const offset = (page - 1) * limit;
  const dataQuery = `
    SELECT ${TICKET_SELECT_FIELDS}
    FROM ticket t
    ${TICKET_JOINS}
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  values.push(limit, offset);

  const dataResult = await pool.query(dataQuery, values);
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
  const commentFilter = includeInternal ? "" : "AND c.is_internal = false";
  const commentsResult = await pool.query(
    `SELECT c.comment_id, c.ticket_id, c.author_id::text AS author_id, c.body, c.is_internal, c.created_at, c.updated_at,
            c.edited_at, c.deleted_at,
            TRIM(CONCAT(u.name, ' ', u.surname)) AS author_name,
            u.email AS author_email,
            u.role AS author_role
     FROM comment c
     LEFT JOIN users u ON c.author_id = u.user_id
     WHERE c.ticket_id = $1 ${commentFilter}
     ORDER BY c.created_at ASC`,
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
  if (updateData.priority !== undefined) {
    fields.push(`ticket_priority = $${paramIndex++}`);
    values.push(updateData.priority);
  }
  if (updateData.status !== undefined) {
    fields.push(`ticket_status = $${paramIndex++}`);
    values.push(updateData.status);
  }
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

// Soft delete only: nothing is ever hard-deleted (briefing p.5 "Audit trail")
export const deleteTicket = async (ticketId: number): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE ticket
     SET deleted_at = NOW(), ticket_status = 'Cancelled', updated_at = NOW()
     WHERE ticket_id = $1 AND deleted_at IS NULL
     RETURNING ticket_id`,
    [ticketId]
  );
  return (result.rowCount ?? 0) > 0;
};

export interface AssignTicketResult {
  success: boolean;
  statusCode: number;
  message: string;
  ticket?: TicketDetail;
}

export const assignTicket = async (
  ticketId: number,
  currentUser: User,
  assigneeId?: string | null
): Promise<AssignTicketResult> => {
  const access = await loadTicketAccess(currentUser);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock ticket row for update to prevent concurrent double-claiming
    const ticketResult = await client.query(
      `SELECT t.*, d.department_name
       FROM ticket t
       LEFT JOIN department d ON t.ticket_department_id = d.department_id
       WHERE t.ticket_id = $1 AND t.deleted_at IS NULL
       FOR UPDATE OF t`,
      [ticketId]
    );

    if (ticketResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        success: false,
        statusCode: 404,
        message: "Ticket not found."
      };
    }

    const ticket = ticketResult.rows[0];

    // Department scoping (ticketAccess): don't admit the ticket exists to someone who can't view it,
    // and only staff of the ticket's department may claim or assign it
    if (!canView(access, ticket)) {
      await client.query("ROLLBACK");
      return { success: false, statusCode: 404, message: "Ticket not found." };
    }
    if (!canWork(access, ticket)) {
      await client.query("ROLLBACK");
      return {
        success: false,
        statusCode: 403,
        message: "Forbidden: Only agents and leads of this ticket's department can assign it."
      };
    }

    // Status validation: cannot assign closed, resolved, or cancelled tickets
    const terminalStatuses = ["Closed", "Resolved", "Cancelled"];
    if (terminalStatuses.includes(ticket.ticket_status)) {
      await client.query("ROLLBACK");
      return {
        success: false,
        statusCode: 400,
        message: `Cannot assign a ${ticket.ticket_status.toLowerCase()} ticket.`
      };
    }

    let resolvedAssigneeId: string;

    if (currentUser.role === "Agent") {
      // Support Agents can only self-assign
      if (assigneeId !== undefined && assigneeId !== null && String(assigneeId).trim() !== "" && String(assigneeId).trim() !== String(currentUser.user_id)) {
        await client.query("ROLLBACK");
        return {
          success: false,
          statusCode: 403,
          message: "Forbidden: Support agents can only assign tickets to themselves."
        };
      }
      resolvedAssigneeId = String(currentUser.user_id);

      // Validate unassigned: agents can only claim unassigned tickets (prevent double-claiming)
      if (ticket.assignee_id !== null && ticket.assignee_id !== undefined) {
        await client.query("ROLLBACK");
        return {
          success: false,
          statusCode: 409,
          message: "Ticket is already assigned."
        };
      }
    } else {
      // Department Lead of the ticket's department: assign to an agent of that department (or self-assign)
      if (assigneeId !== undefined && assigneeId !== null && String(assigneeId).trim() !== "") {
        resolvedAssigneeId = String(assigneeId).trim();
      } else {
        resolvedAssigneeId = String(currentUser.user_id);
      }

      // If assigning to another user, validate that target user exists, is active, and is support staff
      if (resolvedAssigneeId !== String(currentUser.user_id)) {
        const targetUserRes = await client.query(
          "SELECT user_id, name, surname, email, role, active, department_id FROM users WHERE user_id = $1",
          [resolvedAssigneeId]
        );

        if (targetUserRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return {
            success: false,
            statusCode: 400,
            message: "Assignee user not found."
          };
        }

        const targetUser = targetUserRes.rows[0];
        if (!targetUser.active) {
          await client.query("ROLLBACK");
          return {
            success: false,
            statusCode: 400,
            message: "Assignee user is inactive."
          };
        }

        const staffRoles = ["Agent", "Department Lead"];
        if (!staffRoles.includes(targetUser.role)) {
          await client.query("ROLLBACK");
          return {
            success: false,
            statusCode: 400,
            message: "Tickets can only be assigned to support staff (agents or leads)."
          };
        }

        // The assignee must be able to work the ticket, i.e. belong to (or lead) its department
        const targetAccess = await loadTicketAccess(targetUser);
        if (!canWork(targetAccess, ticket)) {
          await client.query("ROLLBACK");
          return {
            success: false,
            statusCode: 400,
            message: "Tickets can only be assigned to agents of the ticket's department."
          };
        }
      }
    }

    // Owning a ticket opens it: New -> Open in the same transaction (briefing p.11 S2)
    let newStatus = ticket.ticket_status;
    if (ticket.ticket_status === "New") {
      newStatus = "Open";
    }

    await client.query(
      `UPDATE ticket
       SET assignee_id = $1,
           ticket_status = $2,
           updated_at = NOW()
       WHERE ticket_id = $3`,
      [resolvedAssigneeId, newStatus, ticketId]
    );

    const selfClaim = resolvedAssigneeId === String(currentUser.user_id) && !ticket.assignee_id;
    await logEvent(client, {
      ticketId,
      actorId: currentUser.user_id,
      type: selfClaim ? "claimed" : "assigned",
      from: ticket.assignee_id ? String(ticket.assignee_id) : null,
      to: resolvedAssigneeId,
    });
    if (newStatus !== ticket.ticket_status) {
      await logEvent(client, {
        ticketId,
        actorId: currentUser.user_id,
        type: "status_changed",
        from: ticket.ticket_status,
        to: newStatus,
      });
    }

    await client.query("COMMIT");

    // Fetch updated ticket with requester & assignee details
    const fullTicket = await getTicketById(ticketId, true, false);

    // Trigger email notification to employee (ticket requester)
    if (fullTicket && fullTicket.requester_email) {
      sendTicketAssignedEmail({
        recipientEmail: fullTicket.requester_email,
        recipientName: fullTicket.requester_name || "Valued User",
        ticketId: fullTicket.ticket_id,
        ticketTitle: fullTicket.title,
        assigneeName: fullTicket.assignee_name || "Support Agent",
        status: fullTicket.ticket_status,
      }).catch((err) => {
        console.error("[ticketService] Failed to send ticket assignment email:", err);
      });
    }

    return {
      success: true,
      statusCode: 200,
      message: "Ticket assigned successfully",
      ticket: fullTicket!
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getCommentEditWindowMinutes = (): number => {
  const envVal = process.env.COMMENT_EDIT_WINDOW_MINUTES;
  if (envVal && !isNaN(parseInt(envVal, 10))) {
    return parseInt(envVal, 10);
  }
  return 15; // default configurable 15 minutes window
};

export interface CommentResult {
  success: boolean;
  statusCode: number;
  message: string;
  comment?: TicketComment;
}

export const getTicketComments = async (
  ticketId: number,
  currentUser: User
): Promise<{ success: boolean; statusCode: number; message: string; comments?: TicketComment[] }> => {
  // ticketAccess: requester or staff of the ticket's department, otherwise 404
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // Internal notes only for staff who can work the ticket
  const commentFilter = resolved.canWork ? "" : "AND c.is_internal = false";

  const commentsResult = await pool.query(
    `SELECT c.comment_id, c.ticket_id, c.author_id, c.body, c.is_internal, c.created_at, c.updated_at,
            TRIM(CONCAT(u.name, ' ', u.surname)) AS author_name,
            u.email AS author_email,
            u.role AS author_role
     FROM comment c
     LEFT JOIN users u ON c.author_id = u.user_id
     WHERE c.ticket_id = $1 ${commentFilter}
     ORDER BY c.created_at ASC`,
    [ticketId]
  );

  return {
    success: true,
    statusCode: 200,
    message: "Comments retrieved successfully",
    comments: commentsResult.rows as TicketComment[]
  };
};

export const addComment = async (
  ticketId: number,
  currentUser: User,
  body: string,
  isInternal: boolean = false
): Promise<CommentResult> => {
  // Validate comment body
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return { success: false, statusCode: 400, message: "Comment body cannot be empty." };
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length > 5000) {
    return { success: false, statusCode: 400, message: "Comment body cannot exceed 5000 characters." };
  }

  // Check ticket existence
  const ticketRes = await pool.query(
    `SELECT t.ticket_id, t.title, t.ticket_status, t.requester_id, t.assignee_id,
            req.email AS requester_email, TRIM(CONCAT(req.name, ' ', req.surname)) AS requester_name,
            asg.email AS assignee_email, TRIM(CONCAT(asg.name, ' ', asg.surname)) AS assignee_name
     FROM ticket t
     LEFT JOIN users req ON t.requester_id = req.user_id
     LEFT JOIN users asg ON t.assignee_id = asg.user_id
     WHERE t.ticket_id = $1 AND t.deleted_at IS NULL`,
    [ticketId]
  );

  if (ticketRes.rowCount === 0) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  const ticket = ticketRes.rows[0];

  // ticketAccess: only the requester or staff of the ticket's department may comment (others get 404)
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // Only staff who can work the ticket may post internal notes
  if (isInternal && !resolved.canWork) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: Only agents and leads of this ticket's department can post internal notes."
    };
  }

  // Insert comment
  const insertResult = await pool.query(
    `INSERT INTO comment (ticket_id, author_id, body, is_internal, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING comment_id, ticket_id, author_id, body, is_internal, created_at, updated_at`,
    [ticketId, currentUser.user_id, trimmedBody, isInternal]
  );

  const newComment = insertResult.rows[0];
  newComment.author_name = `${currentUser.name} ${currentUser.surname || ""}`.trim();
  newComment.author_email = currentUser.email;
  newComment.author_role = currentUser.role;

  // Trigger email notifications:
  // "users recieve email notification for each posted comment"
  const authorName = `${currentUser.name} ${currentUser.surname || ""}`.trim();

  if (!isInternal) {
    // Public comment:
    // If author is the ticket requester -> notify the assigned agent (if assigned)
    if (String(currentUser.user_id) === String(ticket.requester_id)) {
      if (ticket.assignee_email) {
        sendTicketCommentEmail({
          recipientEmail: ticket.assignee_email,
          recipientName: ticket.assignee_name || "Support Agent",
          ticketId: ticket.ticket_id,
          ticketTitle: ticket.title,
          authorName,
          authorRole: currentUser.role,
          commentBody: trimmedBody,
          isInternal: false
        }).catch((err) => {
          console.error("[ticketService] Failed to send comment email to assignee:", err);
        });
      }
    } else {
      // Author is agent / lead / admin -> notify the ticket requester
      if (ticket.requester_email) {
        sendTicketCommentEmail({
          recipientEmail: ticket.requester_email,
          recipientName: ticket.requester_name || "Valued User",
          ticketId: ticket.ticket_id,
          ticketTitle: ticket.title,
          authorName,
          authorRole: currentUser.role,
          commentBody: trimmedBody,
          isInternal: false
        }).catch((err) => {
          console.error("[ticketService] Failed to send comment email to requester:", err);
        });
      }
    }
  } else {
    // Internal note:
    // Only notify assigned agent if author is not the assignee (never notify requester)
    if (ticket.assignee_email && String(currentUser.user_id) !== String(ticket.assignee_id)) {
      sendTicketCommentEmail({
        recipientEmail: ticket.assignee_email,
        recipientName: ticket.assignee_name || "Support Agent",
        ticketId: ticket.ticket_id,
        ticketTitle: ticket.title,
        authorName,
        authorRole: currentUser.role,
        commentBody: trimmedBody,
        isInternal: true
      }).catch((err) => {
        console.error("[ticketService] Failed to send internal note email to assignee:", err);
      });
    }
  }

  return {
    success: true,
    statusCode: 201,
    message: isInternal ? "Internal note posted successfully" : "Comment posted successfully",
    comment: newComment
  };
};

export const getCommentById = async (commentId: number): Promise<(TicketComment & { age_minutes?: number }) | null> => {
  const result = await pool.query(
    `SELECT c.comment_id, c.ticket_id, c.author_id, c.body, c.is_internal, c.created_at, c.updated_at,
            EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 60.0 AS age_minutes,
            TRIM(CONCAT(u.name, ' ', u.surname)) AS author_name,
            u.email AS author_email,
            u.role AS author_role
     FROM comment c
     LEFT JOIN users u ON c.author_id = u.user_id
     WHERE c.comment_id = $1`,
    [commentId]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
};

export const updateComment = async (
  commentId: number,
  currentUser: User,
  newBody: string
): Promise<CommentResult> => {
  if (!newBody || typeof newBody !== "string" || newBody.trim().length === 0) {
    return { success: false, statusCode: 400, message: "Comment body cannot be empty." };
  }

  const trimmedBody = newBody.trim();
  if (trimmedBody.length > 5000) {
    return { success: false, statusCode: 400, message: "Comment body cannot exceed 5000 characters." };
  }

  const existing = await getCommentById(commentId);
  if (!existing) {
    return { success: false, statusCode: 404, message: "Comment not found." };
  }

  // ticketAccess: a comment on a ticket the user can't view (or an internal note they can't see) "doesn't exist"
  const resolved = await resolveTicketAccess(existing.ticket_id, currentUser);
  if (!resolved || (existing.is_internal && !resolved.canWork)) {
    return { success: false, statusCode: 404, message: "Comment not found." };
  }

  const isAuthor = String(existing.author_id) === String(currentUser.user_id);

  if (!isAuthor) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: You are not authorized to edit this comment."
    };
  }

  // Authors can edit their own comments within a configurable time window
  const windowMinutes = getCommentEditWindowMinutes();
  const ageMinutes = existing.age_minutes !== undefined
    ? Number(existing.age_minutes)
    : (Date.now() - new Date(existing.created_at).getTime()) / (1000 * 60);

  if (ageMinutes > windowMinutes) {
    return {
      success: false,
      statusCode: 403,
      message: `Forbidden: Comments can only be edited within ${windowMinutes} minutes of posting.`
    };
  }

  const updateResult = await pool.query(
    `UPDATE comment
     SET body = $1, updated_at = NOW()
     WHERE comment_id = $2
     RETURNING comment_id, ticket_id, author_id, body, is_internal, created_at, updated_at`,
    [trimmedBody, commentId]
  );

  const updatedComment = updateResult.rows[0];
  updatedComment.author_name = existing.author_name;
  updatedComment.author_email = existing.author_email;
  updatedComment.author_role = existing.author_role;

  return {
    success: true,
    statusCode: 200,
    message: "Comment updated successfully",
    comment: updatedComment
  };
};

export const deleteComment = async (
  commentId: number,
  currentUser: User
): Promise<{ success: boolean; statusCode: number; message: string }> => {
  const existing = await getCommentById(commentId);
  if (!existing) {
    return { success: false, statusCode: 404, message: "Comment not found." };
  }

  // ticketAccess: a comment on a ticket the user can't view (or an internal note they can't see) "doesn't exist"
  const resolved = await resolveTicketAccess(existing.ticket_id, currentUser);
  if (!resolved || (existing.is_internal && !resolved.canWork)) {
    return { success: false, statusCode: 404, message: "Comment not found." };
  }

  const isAuthor = String(existing.author_id) === String(currentUser.user_id);

  if (!isAuthor) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: You are not authorized to delete this comment."
    };
  }

  // Authors can delete their own comments within a configurable time window
  const windowMinutes = getCommentEditWindowMinutes();
  const ageMinutes = existing.age_minutes !== undefined
    ? Number(existing.age_minutes)
    : (Date.now() - new Date(existing.created_at).getTime()) / (1000 * 60);

  if (ageMinutes > windowMinutes) {
    return {
      success: false,
      statusCode: 403,
      message: `Forbidden: Comments can only be deleted within ${windowMinutes} minutes of posting.`
    };
  }

  await pool.query("DELETE FROM comment WHERE comment_id = $1", [commentId]);

  return {
    success: true,
    statusCode: 200,
    message: "Comment deleted successfully."
  };
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

// The approval step (briefing p.4): a purchase or access request starts in "Pending approval"
// and only the department lead's approve / reject moves it on. A plain status change may not
// put a ticket into "Pending approval" or take it out, except that the requester may still
// withdraw (cancel) their own pending request. Returns the refusal message, or null if allowed.
export const approvalStepProblem = (
  oldStatus: TicketStatus,
  newStatus: TicketStatus,
  isTicketRequester: boolean
): string | null => {
  if (oldStatus === newStatus) return null;
  if (newStatus === "Pending approval") {
    return "A ticket can't be moved back to Pending approval. Only purchase and access requests start there.";
  }
  if (oldStatus === "Pending approval" && !(newStatus === "Cancelled" && isTicketRequester)) {
    return "This request is waiting for approval. Only the Department Lead can approve or reject it.";
  }
  return null;
};

export const updateTicketStatus = async (
  ticketId: number,
  newStatus: TicketStatus,
  currentUser: User
): Promise<{ success: boolean; statusCode: number; message: string; ticket?: TicketDetail }> => {
  // ticketAccess: 404 for anyone who can't view the ticket
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // Staff of the ticket's department may change status; the requester may only cancel their own ticket
  if (!resolved.canWork) {
    if (!resolved.isRequester) {
      return { success: false, statusCode: 403, message: "Forbidden: You are not authorized to update this ticket." };
    }
    if (newStatus !== "Cancelled") {
      return { success: false, statusCode: 403, message: "Forbidden: Employees can only cancel their own tickets." };
    }
  }

  const oldStatus = resolved.ticket.ticket_status;

  const approvalProblem = approvalStepProblem(oldStatus, newStatus, resolved.isRequester);
  if (approvalProblem) {
    return { success: false, statusCode: 409, message: approvalProblem };
  }

  await pool.query(
    "UPDATE ticket SET ticket_status = $1, updated_at = NOW() WHERE ticket_id = $2",
    [newStatus, ticketId]
  );

  const updatedTicket = await getTicketById(ticketId, resolved.canWork, false);

  // Notify requester via email if status changed
  if (updatedTicket && updatedTicket.requester_email && oldStatus !== newStatus) {
    sendTicketStatusEmail({
      recipientEmail: updatedTicket.requester_email,
      recipientName: updatedTicket.requester_name || "Valued User",
      ticketId: updatedTicket.ticket_id,
      ticketTitle: updatedTicket.title,
      oldStatus,
      newStatus,
      updatedByName: `${currentUser.name} ${currentUser.surname || ""}`.trim()
    }).catch((err) => {
      console.error("[ticketService] Failed to send status update email:", err);
    });
  }

  return {
    success: true,
    statusCode: 200,
    message: `Ticket status updated to ${newStatus}`,
    ticket: updatedTicket!
  };
};

export const approveTicket = async (
  ticketId: number,
  currentUser: User,
  note?: string
): Promise<{ success: boolean; statusCode: number; message: string; ticket?: TicketDetail }> => {
  // ticketAccess: 404 for anyone who can't view the ticket
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // Only the lead of the ticket's own department may approve
  if (currentUser.role !== "Department Lead" || !resolved.canWork) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: Only the Department Lead of this ticket's department can approve requests."
    };
  }

  const existingTicket = resolved.ticket;

  if (existingTicket.ticket_status.toLowerCase() !== "pending approval") {
    return {
      success: false,
      statusCode: 400,
      message: `Ticket is not pending approval. Current status is ${existingTicket.ticket_status}.`
    };
  }

  // Approved: into the department queue as New (Open when someone already owns it)
  const nextStatus: TicketStatus = existingTicket.assignee_id ? "Open" : "New";

  // The SLA clocks start now: a request has none while it waits for approval (page 40)
  await pool.query(
    `UPDATE ticket t
     SET ticket_status = $1,
         updated_at = NOW(),
         first_response_due_at = COALESCE(t.first_response_due_at, NOW() + make_interval(mins => p.first_response_mins)),
         resolution_due_at = COALESCE(t.resolution_due_at, NOW() + make_interval(mins => p.resolution_mins))
     FROM sla_policy p
     WHERE t.ticket_id = $2 AND p.priority = t.ticket_priority`,
    [nextStatus, ticketId]
  );

  // Add internal audit note
  const authorName = `${currentUser.name} ${currentUser.surname || ""}`.trim();
  const noteBody = note ? `Request Approved: ${note}` : `Request approved by ${authorName} (${currentUser.role}).`;
  await addComment(ticketId, currentUser, noteBody, true);

  const updatedTicket = await getTicketById(ticketId, true, false);
  return {
    success: true,
    statusCode: 200,
    message: "Ticket approved successfully.",
    ticket: updatedTicket!
  };
};

export const rejectTicket = async (
  ticketId: number,
  currentUser: User,
  reason?: string
): Promise<{ success: boolean; statusCode: number; message: string; ticket?: TicketDetail }> => {
  // ticketAccess: 404 for anyone who can't view the ticket
  const resolved = await resolveTicketAccess(ticketId, currentUser);
  if (!resolved) {
    return { success: false, statusCode: 404, message: "Ticket not found." };
  }

  // Only the lead of the ticket's own department may reject
  if (currentUser.role !== "Department Lead" || !resolved.canWork) {
    return {
      success: false,
      statusCode: 403,
      message: "Forbidden: Only the Department Lead of this ticket's department can reject requests."
    };
  }

  const existingTicket = resolved.ticket;

  if (existingTicket.ticket_status.toLowerCase() !== "pending approval") {
    return {
      success: false,
      statusCode: 400,
      message: `Ticket is not pending approval. Current status is ${existingTicket.ticket_status}.`
    };
  }

  // The requester is shown why (briefing p.4: "lead rejects (reason shown)"), so a reason is required
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { success: false, statusCode: 400, message: "A reason is required to reject a request." };
  }
  reason = reason.trim();

  // Reject moves to Cancelled
  await pool.query(
    "UPDATE ticket SET ticket_status = 'Cancelled', updated_at = NOW() WHERE ticket_id = $1",
    [ticketId]
  );

  // A public comment, so the requester sees the reason on their ticket (the reject dialog says so)
  await addComment(ticketId, currentUser, `Request rejected: ${reason}`, false);

  const updatedTicket = await getTicketById(ticketId, true, false);
  return {
    success: true,
    statusCode: 200,
    message: "Ticket rejected successfully.",
    ticket: updatedTicket!
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

