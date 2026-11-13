// S12 Move to another department (briefing p.20, p.50). Contract: docs/api-sprint-2.md "S12".
// A misrouted ticket is handed over in ONE transaction: department + category change, status New,
// owner cleared, due times KEPT (the requester has already been waiting), moved_count + 1, a public
// `department_changed` event ("Moved from IT Support to Facilities", note = the message to the
// requester) and an internal one (note = the reason), and department_changed notifications to the
// requester and the new department's lead. Because departments are private (S1), the old
// department answers 404 on the ticket afterwards.
import { pool, withTransaction } from "../config/database";
import { logEvent } from "./events";
import { departmentLeadId, notify, ticketRef } from "./notify";
import { sendPendingSoon } from "./outbox";
import { listCategories } from "./categoryService";
import { TICKET_NOT_FOUND, canView, canWork, loadTicketAccess } from "./ticketAccess";
import { getTicketById } from "./ticketService";
import type { Category } from "../types/category.types";
import type { TicketDetail, TicketStatus } from "../types/ticket.types";
import type { User } from "../types/user.types";
import { HttpError } from "../utils/httpError";

const MAX_TEXT = 5000;

/** Statuses a ticket can't be moved out of: decide the approval first, or it is finished */
const UNMOVABLE: Partial<Record<TicketStatus, string>> = {
  "Pending approval": "This request is waiting for approval. Approve or reject it before moving it.",
  Resolved: "This ticket is Resolved, so it can't be moved.",
  Closed: "This ticket is Closed, so it can't be moved.",
  Cancelled: "This ticket is Cancelled, so it can't be moved.",
};

export interface MoveInput {
  department_id: number;
  category_id: number;
  reason: string;
  message: string | null;
}

const MAX_INT_ID = 2147483647;
const intId = (value: unknown): number | null => {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_INT_ID ? Number(text) : null;
};

const optionalText = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `The ${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT) throw new HttpError(400, `The ${label} can be at most ${MAX_TEXT} characters.`);
  return trimmed || null;
};

/** Checks the body shape (400 with every problem listed), after the ticket's access checks */
export const parseMoveInput = (body: unknown): MoveInput => {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const departmentId = intId(raw.department_id);
  const categoryId = intId(raw.category_id);
  if (departmentId === null) errors.push("Choose the department to move it to.");
  if (categoryId === null) errors.push("Choose a category in that department.");
  let reason: string | null = null;
  let message: string | null = null;
  try {
    reason = optionalText(raw.reason, "reason");
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (!reason && !errors.some((e) => e.startsWith("The reason"))) errors.push("Add a reason for the move (only staff see it).");
  try {
    message = optionalText(raw.message, "message");
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (errors.length) throw new HttpError(400, errors[0], errors);
  return { department_id: departmentId!, category_id: categoryId!, reason: reason!, message };
};

const fullName = (user: Pick<User, "name" | "surname">) => `${user.name} ${user.surname ?? ""}`.trim();

/** PATCH /api/tickets/:id/department */
export const moveTicketDepartment = async (
  ticketId: number,
  user: User,
  body: unknown
): Promise<{ ticket: TicketDetail; to_department_name: string }> => {
  const access = await loadTicketAccess(user);
  const moved = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT t.ticket_id, t.title, t.requester_id::text AS requester_id, t.assignee_id::text AS assignee_id,
              t.ticket_department_id, t.ticket_category_id, t.ticket_status, d.department_name
       FROM ticket t
       LEFT JOIN department d ON d.department_id = t.ticket_department_id
       WHERE t.ticket_id = $1 AND t.deleted_at IS NULL
       FOR UPDATE OF t`,
      [ticketId]
    );
    const ticket = rows[0];
    // Outside the department (and not the requester): the ticket doesn't exist for you
    if (!ticket || !canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
    // The requester sees their ticket but routing it is the department's call
    if (!canWork(access, ticket)) {
      throw new HttpError(403, "Only agents and leads of this ticket's department can move it.");
    }
    const blocked = UNMOVABLE[ticket.ticket_status as TicketStatus];
    if (blocked) throw new HttpError(409, blocked);
    // Only now look at the body: 404 / 403 / 409 first, like approve and reject
    const input = parseMoveInput(body);

    if (Number(ticket.ticket_department_id) === input.department_id) {
      throw new HttpError(400, `This ticket is already in ${ticket.department_name}. Choose another department.`);
    }
    const dept = await client.query(
      `SELECT department_id, department_name, status FROM department WHERE department_id = $1`,
      [input.department_id]
    );
    const target = dept.rows[0];
    if (!target || target.status !== "active") throw new HttpError(400, "Choose an active department to move it to.");
    const cat = await client.query(
      `SELECT category_id, category_name, department_id, active FROM category WHERE category_id = $1`,
      [input.category_id]
    );
    const category = cat.rows[0];
    if (!category || !category.active || Number(category.department_id) !== input.department_id) {
      throw new HttpError(400, `Choose an active category in ${target.department_name}.`);
    }

    // Due times are deliberately left alone: the clock keeps counting from when the employee asked
    await client.query(
      `UPDATE ticket
       SET ticket_department_id = $1, ticket_category_id = $2, ticket_status = 'New', assignee_id = NULL,
           moved_count = moved_count + 1, updated_at = now()
       WHERE ticket_id = $3`,
      [input.department_id, input.category_id, ticketId]
    );

    const from = ticket.department_name as string;
    const to = target.department_name as string;
    // Public: "Moved from IT Support to Facilities" + the message to the requester
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "department_changed",
      from,
      to,
      note: input.message,
    });
    // Staff only: why it moved (never shown to the requester)
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "department_changed",
      from,
      to,
      note: input.reason,
      isInternal: true,
    });
    // The status and owner reset are part of the move; record the status change when there was one
    if (ticket.ticket_status !== "New") {
      await logEvent(client, {
        ticketId,
        actorId: user.user_id,
        type: "status_changed",
        from: ticket.ticket_status,
        to: "New",
      });
    }

    // S9: the requester hears where it went (public message only); the new lead gets the reason
    const ref = ticketRef(ticketId);
    await notify(client, {
      userIds: [ticket.requester_id],
      ticketId,
      actorId: user.user_id,
      type: "department_changed",
      title: `${ref} moved to ${to}`,
      body: input.message ?? `${ticket.title} is now with ${to}.`,
    });
    const leadId = await departmentLeadId(client, input.department_id);
    // The requester already has their own notification (and never sees the internal reason)
    if (leadId && String(leadId) !== String(ticket.requester_id)) {
      await notify(client, {
        userIds: [leadId],
        ticketId,
        actorId: user.user_id,
        type: "department_changed",
        title: `${fullName(user)} moved ${ref} from ${from} to ${to}`,
        body: input.reason,
      });
    }
    // The previous owner loses access with the move: tell them, unless they moved it themselves
    if (
      ticket.assignee_id &&
      String(ticket.assignee_id) !== String(user.user_id) &&
      String(ticket.assignee_id) !== String(ticket.requester_id) &&
      String(ticket.assignee_id) !== String(leadId)
    ) {
      await notify(client, {
        userIds: [ticket.assignee_id],
        // No link: they can't open it any more (it would be a 404)
        ticketId: null,
        actorId: user.user_id,
        type: "department_changed",
        title: `${fullName(user)} moved your ticket ${ref} to ${to}`,
        body: `${input.reason} · It's no longer in your queue.`,
      });
    }
    return { to };
  });
  sendPendingSoon();

  // The mover usually can't see the ticket any more: answer without internal notes
  const ticket = await getTicketById(ticketId, false, false);
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  return { ticket, to_department_name: moved.to };
};

/** GET /api/departments/:id/categories: active categories of an active department (move picker) */
export const activeDepartmentCategories = async (departmentId: number): Promise<Category[]> => {
  const { rows } = await pool.query(`SELECT status FROM department WHERE department_id = $1`, [departmentId]);
  if (!rows[0] || rows[0].status !== "active") throw new HttpError(404, "Department not found.");
  const { categories } = await listCategories(false);
  return categories.filter((c) => Number(c.department_id) === departmentId);
};
