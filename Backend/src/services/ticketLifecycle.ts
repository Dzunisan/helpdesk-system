// S2 Ticket lifecycle & ownership (briefing p.4, p.11) and S3 priority triage (p.12).
// Contract: docs/api-sprint-1.md "S2" / "S3", docs/api-sprint-2.md (S6 approvals, S9 notifications).
// Every change locks the ticket row, checks the rules, writes the change, its timeline event(s) and
// its notifications (S9 notify(): in-app rows + queued emails) in ONE transaction, and only after
// commit hands the queued emails to the outbox (sendPendingSoon, fire and forget).
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database";
import { logEvent } from "./events";
import { computeDueTimes, loadSlaPolicies } from "./sla";
import {
  TICKET_NOT_FOUND,
  TicketAccessUser,
  canView,
  canWork,
  isDepartmentLead,
  isRequester,
  loadTicketAccess,
} from "./ticketAccess";
import { getTicketById } from "./ticketService";
import {
  FINAL_STATUSES,
  REOPEN_WINDOW_DAYS,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  TransitionTicket,
  allowedTransitions,
  checkTransition,
  transitionRolesOf,
} from "../types/ticket.types";
import type { User } from "../types/user.types";
import { HttpError } from "../utils/httpError";
import { notify, requestCsat, ticketRef } from "./notify";
import { sendPendingSoon } from "./outbox";

/** The ticket fields the lifecycle rules need, read with the row lock */
export interface LifecycleTicket extends TransitionTicket {
  ticket_id: number;
  title: string;
  requester_id: string;
  assignee_id: string | null;
  ticket_department_id: number;
  ticket_status: TicketStatus;
  ticket_priority: TicketPriority;
  created_at: Date;
  resolved_at: Date | null;
  first_response_due_at: Date | null;
  resolution_due_at: Date | null;
  reopen_count: number;
  assignee_name: string | null;
  assignee_first_name: string | null;
}

const LIFECYCLE_SELECT = `
  SELECT t.ticket_id, t.title, t.requester_id::text AS requester_id, t.assignee_id::text AS assignee_id,
         t.ticket_department_id, t.ticket_status, t.ticket_priority, t.created_at, t.resolved_at,
         t.first_response_due_at, t.resolution_due_at, t.reopen_count,
         NULLIF(TRIM(CONCAT(asg.name, ' ', asg.surname)), '') AS assignee_name,
         asg.name AS assignee_first_name
  FROM ticket t
  LEFT JOIN users asg ON asg.user_id = t.assignee_id
  WHERE t.ticket_id = $1 AND t.deleted_at IS NULL`;

/** Statuses a lead may (re)assign in (contract: New, Open, Waiting on employee) */
const ASSIGNABLE_STATUSES: TicketStatus[] = ["New", "Open", "Waiting on employee"];

const MAX_NOTE_LENGTH = 5000;

/**
 * Page 4: "only the owner (or the lead) may change an Open ticket". Any agent of the department
 * triages a ticket nobody owns yet (New, Pending approval); once someone owns it (Open, Waiting on
 * employee) only they or the department's lead change its priority. Null when allowed.
 */
const priorityProblem = (access: TicketAccessUser, ticket: LifecycleTicket): string | null => {
  if (!canWork(access, ticket)) return "Only agents and leads of this ticket's department can change its priority.";
  if (!ticket.assignee_id || isDepartmentLead(access, ticket) || sameId(ticket.assignee_id, access.user_id)) return null;
  return `Only ${ticket.assignee_first_name || "the owner"} or the department lead can change this ticket's priority.`;
};

const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

const fullName = (user: Pick<User, "name" | "surname">) => `${user.name} ${user.surname ?? ""}`.trim();

/**
 * Locks the ticket row (FOR UPDATE) inside the caller's transaction and checks the caller may see it.
 * Not found and not allowed are the same 404, so we never admit the ticket exists.
 */
const lockTicket = async (
  client: PoolClient,
  ticketId: number,
  user: User
): Promise<{ ticket: LifecycleTicket; access: TicketAccessUser }> => {
  const { rows } = await client.query<LifecycleTicket>(`${LIFECYCLE_SELECT} FOR UPDATE OF t`, [ticketId]);
  const ticket = rows[0];
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  // After waiting on the lock Postgres re-reads the ticket row but not the joined user, so the
  // owner's name is looked up again ("Sipho claimed this a moment ago")
  if (ticket.assignee_id) {
    const owner = await client.query(`SELECT name, surname FROM users WHERE user_id = $1`, [ticket.assignee_id]);
    ticket.assignee_first_name = owner.rows[0]?.name ?? null;
    ticket.assignee_name = owner.rows[0] ? fullName(owner.rows[0]) : null;
  } else {
    ticket.assignee_first_name = null;
    ticket.assignee_name = null;
  }
  const access = await loadTicketAccess(user);
  if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
  return { ticket, access };
};

/** Reads the ticket (no lock) and checks the caller may see it */
const readTicket = async (ticketId: number, user: User) => {
  const { rows } = await pool.query<LifecycleTicket>(LIFECYCLE_SELECT, [ticketId]);
  const ticket = rows[0];
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  const access = await loadTicketAccess(user);
  if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
  return { ticket, access };
};

const cleanNote = (note: unknown): string | null => {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new HttpError(400, "The note must be text.");
  const trimmed = note.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) throw new HttpError(400, `The note can be at most ${MAX_NOTE_LENGTH} characters.`);
  return trimmed.length ? trimmed : null;
};

/** The full ticket for the response, with internal notes only for department staff */
const loadResponseTicket = async (ticketId: number, staff: boolean): Promise<TicketDetail> => {
  const ticket = await getTicketById(ticketId, staff, false);
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  return ticket;
};

/** Plain-text first words of a note for a notification's second line */
const snippet = (text: string | null | undefined) => (text ? text.replace(/\s+/g, " ").trim().slice(0, 200) : null);

// ---------------------------------------------------------------------------------------------
// Resolved -> Closed after REOPEN_WINDOW_DAYS ("check on read is fine", p.11)
// ---------------------------------------------------------------------------------------------

/**
 * Closes every Resolved ticket whose 5-day "Still broken" window has passed (or just `ticketId`),
 * with a system `status_changed` event (actor null) in the same statement. closed_at and the event
 * time are the moment the window ended, so the timeline reads true however late the check runs.
 * Each closed ticket also gets its CSAT survey (S10: csat_requested_at + a csat_requested
 * notification) in the same transaction. Call before any read that shows status: list, detail,
 * actions, timeline. The jobs runner (services/jobs.ts) calls it too.
 */
export const closeExpiredResolved = async (ticketId?: number): Promise<number> => {
  const params: unknown[] = [REOPEN_WINDOW_DAYS, `Closed automatically ${REOPEN_WINDOW_DAYS} days after it was resolved.`];
  if (ticketId !== undefined) params.push(ticketId);
  // Cheap check first: most reads find nothing to close and never open a transaction
  const due = await pool.query(
    `SELECT 1 FROM ticket
     WHERE ticket_status = 'Resolved' AND deleted_at IS NULL AND resolved_at IS NOT NULL
       AND resolved_at + make_interval(days => $1::int) < now()
       ${ticketId !== undefined ? "AND ticket_id = $2" : ""}
     LIMIT 1`,
    ticketId !== undefined ? [REOPEN_WINDOW_DAYS, ticketId] : [REOPEN_WINDOW_DAYS]
  );
  if (!due.rowCount) return 0;

  const closedIds = await withTransaction(async (client) => {
    const { rows } = await client.query<{ ticket_id: number }>(
      `WITH closed AS (
         UPDATE ticket
         SET ticket_status = 'Closed',
             closed_at = resolved_at + make_interval(days => $1::int),
             updated_at = now()
         WHERE ticket_status = 'Resolved'
           AND deleted_at IS NULL
           AND resolved_at IS NOT NULL
           AND resolved_at + make_interval(days => $1::int) < now()
           ${ticketId !== undefined ? "AND ticket_id = $3" : ""}
         RETURNING ticket_id, closed_at
       )
       INSERT INTO ticket_event (ticket_id, actor_id, type, from_value, to_value, note, is_internal, created_at)
       SELECT ticket_id, NULL, 'status_changed', 'Resolved', 'Closed', $2, false, closed_at FROM closed
       RETURNING ticket_id`,
      params
    );
    for (const row of rows) await requestCsat(client, row.ticket_id);
    return rows.map((r) => r.ticket_id);
  });
  if (closedIds.length) sendPendingSoon();
  return closedIds.length;
};

// ---------------------------------------------------------------------------------------------
// Claim and assign (New -> Open sets the owner in the same transaction)
// ---------------------------------------------------------------------------------------------

/** The claim itself, on a locked row: owner = me, New -> Open, `claimed` + `status_changed` */
const claimLocked = async (client: PoolClient, ticket: LifecycleTicket, access: TicketAccessUser, user: User) => {
  if (!canWork(access, ticket)) {
    throw new HttpError(403, "Only agents and leads of this ticket's department can claim it.");
  }
  // The status decides first: a Closed ticket you once owned is "Closed", not "you already own it".
  // Only a live claim (New or Open with an owner) gets the "who has it" wording.
  const live = ticket.ticket_status === "New" || ticket.ticket_status === "Open";
  if (live && ticket.assignee_id) {
    if (sameId(ticket.assignee_id, user.user_id)) throw new HttpError(409, "You already own this ticket.");
    throw new HttpError(409, `${ticket.assignee_first_name || "Someone else"} claimed this a moment ago.`);
  }
  if (ticket.ticket_status !== "New") {
    throw new HttpError(409, `This ticket is ${ticket.ticket_status}, so it can't be claimed.`);
  }

  await client.query(
    `UPDATE ticket SET assignee_id = $1, ticket_status = 'Open', updated_at = now() WHERE ticket_id = $2`,
    [user.user_id, ticket.ticket_id]
  );
  await logEvent(client, { ticketId: ticket.ticket_id, actorId: user.user_id, type: "claimed", to: String(user.user_id) });
  await logEvent(client, { ticketId: ticket.ticket_id, actorId: user.user_id, type: "status_changed", from: "New", to: "Open" });
  // S9: the requester hears that someone has it
  await notify(client, {
    userIds: [ticket.requester_id],
    ticketId: ticket.ticket_id,
    actorId: user.user_id,
    type: "status_changed",
    title: `${fullName(user)} is working on ${ticketRef(ticket.ticket_id)}`,
    body: ticket.title,
  });
};

/** POST /api/tickets/:id/claim */
export const claimTicket = async (ticketId: number, user: User): Promise<TicketDetail> => {
  await withTransaction(async (client) => {
    const { ticket, access } = await lockTicket(client, ticketId, user);
    await claimLocked(client, ticket, access, user);
  });
  sendPendingSoon();
  return loadResponseTicket(ticketId, true);
};

/**
 * PATCH /api/tickets/:id/assign { assignee_id, note? }: the department's lead assigns or reassigns
 * to an active Agent or Lead of the department. An Agent may only name themselves (same as claim).
 */
export const assignTicket = async (
  ticketId: number,
  user: User,
  assigneeId: string | null,
  rawNote: unknown
): Promise<TicketDetail> => {
  const note = cleanNote(rawNote);
  await withTransaction(async (client) => {
    const { ticket, access } = await lockTicket(client, ticketId, user);
    if (!canWork(access, ticket)) {
      throw new HttpError(403, "Only the department lead can assign this ticket.");
    }
    const target = assigneeId ?? String(user.user_id);

    // An Agent naming themselves is a claim, kept for older screens; anyone else is the lead's call
    if (!isDepartmentLead(access, ticket)) {
      if (!sameId(target, user.user_id)) {
        throw new HttpError(403, "Only the department lead can assign this ticket to someone else.");
      }
      await claimLocked(client, ticket, access, user);
      return;
    }

    if (!ASSIGNABLE_STATUSES.includes(ticket.ticket_status)) {
      throw new HttpError(409, `This ticket is ${ticket.ticket_status}, so it can't be assigned.`);
    }
    if (sameId(ticket.assignee_id, target)) {
      throw new HttpError(409, `This ticket is already assigned to ${ticket.assignee_name || "that person"}.`);
    }

    const { rows } = await client.query(
      `SELECT user_id::text AS user_id, name, surname, role, active, department_id FROM users WHERE user_id = $1`,
      [target]
    );
    const assignee = rows[0];
    if (!assignee) throw new HttpError(400, "Choose an agent or lead of this department.");
    if (!assignee.active) throw new HttpError(400, `${fullName(assignee)} is deactivated. Choose someone else.`);
    const assigneeAccess = await loadTicketAccess(assignee);
    if (!canWork(assigneeAccess, ticket)) {
      throw new HttpError(400, `${fullName(assignee)} isn't an agent or lead of this ticket's department.`);
    }

    const opens = ticket.ticket_status === "New";
    await client.query(
      `UPDATE ticket SET assignee_id = $1, ticket_status = $2, updated_at = now() WHERE ticket_id = $3`,
      [target, opens ? "Open" : ticket.ticket_status, ticketId]
    );
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "assigned",
      from: ticket.assignee_id,
      to: target,
      note,
    });
    if (opens) {
      await logEvent(client, { ticketId, actorId: user.user_id, type: "status_changed", from: "New", to: "Open" });
    }
    // S9: the new owner always; the requester only when their request just got an owner (New -> Open)
    await notify(client, {
      userIds: [target],
      ticketId,
      actorId: user.user_id,
      type: "assigned",
      title: `${fullName(user)} assigned ${ticketRef(ticketId)} to you`,
      body: ticket.title,
    });
    if (opens) {
      await notify(client, {
        userIds: [ticket.requester_id],
        ticketId,
        actorId: user.user_id,
        type: "status_changed",
        title: `${fullName(assignee)} is working on ${ticketRef(ticketId)}`,
        body: ticket.title,
      });
    }
  });
  sendPendingSoon();
  return loadResponseTicket(ticketId, true);
};

// ---------------------------------------------------------------------------------------------
// Transitions along the TRANSITIONS arrows
// ---------------------------------------------------------------------------------------------

/**
 * Refusals for arrows that exist in TRANSITIONS but are taken through another endpoint:
 * New -> Open is claim/assign, a lead's Pending approval moves are approve/reject (S6).
 */
const otherEndpointProblem = (
  access: TicketAccessUser,
  ticket: LifecycleTicket,
  to: TicketStatus
): string | null => {
  if (ticket.ticket_status === "New" && to === "Open" && canWork(access, ticket)) {
    return "Claim or assign it to open it.";
  }
  if (ticket.ticket_status === "Pending approval" && !isRequester(access, ticket) && isDepartmentLead(access, ticket)) {
    if (to === "New" || to === "Cancelled") return "Approve or reject this request instead.";
  }
  return null;
};

/** Every status POST /transition accepts from this user right now */
const transitionTargets = (access: TicketAccessUser, ticket: LifecycleTicket, now = new Date()): TicketStatus[] =>
  allowedTransitions(access, ticket, now).filter((to) => !otherEndpointProblem(access, ticket, to));

/** Readable status line for notifications: "HD-1048 is now Waiting on employee" */
const statusTitle = (ticketId: number, to: TicketStatus, actorName: string, reopen: boolean) => {
  const ref = ticketRef(ticketId);
  if (reopen) return `${actorName} says ${ref} is still broken`;
  if (to === "Resolved") return `${actorName} resolved ${ref}`;
  if (to === "Closed") return `${ref} is closed`;
  if (to === "Cancelled") return `${ref} was cancelled`;
  if (to === "Waiting on employee") return `${actorName} is waiting on your reply on ${ref}`;
  return `${ref} is now ${to}`;
};

export interface TransitionOptions {
  /**
   * false: skip the status_changed notification (a reply sent with set_status already told the
   * requester through reply_added). Default true.
   */
  notifyStatus?: boolean;
}

/**
 * The transition itself, inside the caller's transaction: locks the row, checks the arrow and the
 * person, writes the change + events + notifications. Used by POST /:id/transition and by a reply
 * sent with set_status (services/ticketTimeline.ts addComment). Throws HttpError 403/409/400.
 * Resolved needs a note (resolution_note) and stamps resolved_at; Closed stamps closed_at and sends
 * the CSAT survey (S10); Resolved -> Open ("Still broken") adds 1 to reopen_count and restarts the
 * resolution clock.
 */
export const transitionInTransaction = async (
  client: PoolClient,
  ticketId: number,
  user: User,
  to: TicketStatus,
  note: string | null,
  options: TransitionOptions = {}
): Promise<{ from: TicketStatus; staff: boolean }> => {
  const { ticket, access } = await lockTicket(client, ticketId, user);
  const from = ticket.ticket_status;
  const staff = canWork(access, ticket);

  const elsewhere = otherEndpointProblem(access, ticket, to);
  if (elsewhere) throw new HttpError(409, elsewhere);

  const check = checkTransition(access, ticket, to);
  if (!check.ok) throw new HttpError(check.status, check.message);

  if (to === "Resolved" && !note) {
    throw new HttpError(400, "Add a resolution note so the employee knows what was done.");
  }

  const reopen = from === "Resolved" && to === "Open";
  const sets = ["ticket_status = $1", "updated_at = now()"];
  const values: unknown[] = [to];
  if (to === "Resolved") {
    values.push(note);
    sets.push("resolved_at = now()", `resolution_note = $${values.length}`);
  }
  if (to === "Closed") sets.push("closed_at = now()");
  if (reopen) sets.push("reopen_count = reopen_count + 1", "resolved_at = NULL", "resolution_note = NULL");
  values.push(ticketId);
  await client.query(`UPDATE ticket SET ${sets.join(", ")} WHERE ticket_id = $${values.length}`, values);

  if (reopen) {
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "reopened",
      from: String(ticket.reopen_count),
      to: String(ticket.reopen_count + 1),
      note,
    });
  }
  await logEvent(client, {
    ticketId,
    actorId: user.user_id,
    type: "status_changed",
    from,
    to,
    note: reopen ? null : note,
  });

  // S9: requester and owner hear about status changes (never the person who made it)
  if (options.notifyStatus !== false) {
    await notify(client, {
      userIds: [ticket.requester_id, ticket.assignee_id],
      ticketId,
      actorId: user.user_id,
      type: "status_changed",
      title: statusTitle(ticketId, to, fullName(user), reopen),
      body: snippet(note) ?? ticket.title,
    });
  }
  // S10: a ticket the employee confirmed fixed gets its "How did we do?" survey
  if (to === "Closed") await requestCsat(client, ticketId);
  return { from, staff };
};

/** POST /api/tickets/:id/transition { to, note? } (see transitionInTransaction) */
export const transitionTicket = async (
  ticketId: number,
  user: User,
  to: TicketStatus,
  rawNote: unknown
): Promise<TicketDetail> => {
  const note = cleanNote(rawNote);
  const { staff } = await withTransaction((client) => transitionInTransaction(client, ticketId, user, to, note));
  sendPendingSoon();
  return loadResponseTicket(ticketId, staff);
};

// ---------------------------------------------------------------------------------------------
// GET /api/tickets/:id/actions: the buttons this user may see right now
// ---------------------------------------------------------------------------------------------

export type TicketAction =
  | "claim"
  | "assign"
  | "change_priority"
  | "reply"
  | "internal_note"
  | "wait"
  | "resume"
  | "resolve"
  | "confirm_fixed"
  | "still_broken"
  | "cancel"
  | "approve"
  | "reject";

export interface TicketActions {
  actions: TicketAction[];
  transitions: TicketStatus[];
  reopen_until: string | null;
}

export const getTicketActions = async (ticketId: number, user: User): Promise<TicketActions> => {
  await closeExpiredResolved(ticketId);
  const { ticket, access } = await readTicket(ticketId, user);
  const now = new Date();
  const status = ticket.ticket_status;
  const staff = canWork(access, ticket);
  const lead = isDepartmentLead(access, ticket);
  const requester = isRequester(access, ticket);
  const final = FINAL_STATUSES.includes(status);
  const roles = transitionRolesOf(access, ticket);
  const transitions = transitionTargets(access, ticket, now);
  const can = (to: TicketStatus) => transitions.includes(to);

  const actions: TicketAction[] = [];
  if (staff && status === "New" && !ticket.assignee_id) actions.push("claim");
  if (lead && ASSIGNABLE_STATUSES.includes(status)) actions.push("assign");
  if (!final && !priorityProblem(access, ticket)) actions.push("change_priority");
  if ((requester || staff) && !final) actions.push("reply");
  if (staff && !final) actions.push("internal_note");
  if (status === "Open" && can("Waiting on employee")) actions.push("wait");
  if (status === "Waiting on employee" && can("Open") && (roles.has("assignee") || roles.has("lead"))) actions.push("resume");
  if (status === "Open" && can("Resolved")) actions.push("resolve");
  if (status === "Resolved" && requester && can("Closed")) actions.push("confirm_fixed");
  if (status === "Resolved" && requester && can("Open")) actions.push("still_broken");
  if (requester && (status === "New" || status === "Pending approval") && can("Cancelled")) actions.push("cancel");
  if (lead && status === "Pending approval") actions.push("approve", "reject");

  const reopenUntil =
    status === "Resolved" && ticket.resolved_at
      ? new Date(new Date(ticket.resolved_at).getTime() + REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : null;

  return { actions, transitions, reopen_until: reopenUntil };
};

// ---------------------------------------------------------------------------------------------
// S3: PATCH /api/tickets/:id/priority
// ---------------------------------------------------------------------------------------------

/**
 * Staff of the department change priority (once owned: the owner or the lead); both due times are recalculated from created_at (or the S6 approval time) with
 * the current policies (page 5), never from now. Pending approval tickets have no clock yet (S6
 * starts it on approval), so only the priority changes. One `priority_changed` event.
 */
export const changePriority = async (ticketId: number, user: User, priority: TicketPriority): Promise<TicketDetail> => {
  await closeExpiredResolved(ticketId);
  await withTransaction(async (client) => {
    const { ticket, access } = await lockTicket(client, ticketId, user);
    const notAllowed = priorityProblem(access, ticket);
    if (notAllowed) throw new HttpError(403, notAllowed);
    if (FINAL_STATUSES.includes(ticket.ticket_status)) {
      throw new HttpError(409, `This ticket is ${ticket.ticket_status}, so its priority can't change.`);
    }
    if (ticket.ticket_priority === priority) {
      throw new HttpError(409, `The priority is already ${priority}.`);
    }

    if (ticket.ticket_status === "Pending approval" || !ticket.first_response_due_at) {
      await client.query(`UPDATE ticket SET ticket_priority = $1, updated_at = now() WHERE ticket_id = $2`, [
        priority,
        ticketId,
      ]);
    } else {
      // The clocks start at creation, or at the lead's approval for an S6 request (page 15)
      const approved = await client.query<{ at: Date | null }>(
        `SELECT MAX(created_at) AS at FROM ticket_event WHERE ticket_id = $1 AND type = 'approved'`,
        [ticketId]
      );
      const clockStart = approved.rows[0]?.at ?? ticket.created_at;
      const due = computeDueTimes(clockStart, priority, await loadSlaPolicies(client));
      await client.query(
        `UPDATE ticket
         SET ticket_priority = $1, first_response_due_at = $2, resolution_due_at = $3, updated_at = now()
         WHERE ticket_id = $4`,
        [priority, due.first_response_due_at, due.resolution_due_at, ticketId]
      );
    }
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "priority_changed",
      from: ticket.ticket_priority,
      to: priority,
    });
  });
  return loadResponseTicket(ticketId, true);
};

// ---------------------------------------------------------------------------------------------
// Cancel (legacy DELETE /api/tickets/:id) and the approval step (S6, kept working with events)
// ---------------------------------------------------------------------------------------------

/**
 * POST /api/tickets/:id/approve { note? }: the department lead approves a Pending approval request.
 * New (Open if someone already owns it), the SLA clocks start now. One `approved` event.
 */
export const approveTicket = async (ticketId: number, user: User, rawNote: unknown): Promise<TicketDetail> => {
  const note = cleanNote(rawNote);
  await withTransaction(async (client) => {
    const { ticket, access } = await lockTicket(client, ticketId, user);
    if (!isDepartmentLead(access, ticket)) {
      throw new HttpError(403, "Only the department lead can approve this request.");
    }
    if (ticket.ticket_status !== "Pending approval") {
      throw new HttpError(409, `This ticket is ${ticket.ticket_status}, so there is nothing to approve.`);
    }
    const next: TicketStatus = ticket.assignee_id ? "Open" : "New";
    const due = computeDueTimes(new Date(), ticket.ticket_priority, await loadSlaPolicies(client));
    await client.query(
      `UPDATE ticket
       SET ticket_status = $1, first_response_due_at = $2, resolution_due_at = $3, updated_at = now()
       WHERE ticket_id = $4`,
      [next, due.first_response_due_at, due.resolution_due_at, ticketId]
    );
    await logEvent(client, { ticketId, actorId: user.user_id, type: "approved", from: "Pending approval", to: next, note });
    // S6: the decision row (GET /api/approvals?decided_by=me) and S9: the requester hears about it
    await client.query(
      `INSERT INTO ticket_approval (ticket_id, approver_id, decision, reason) VALUES ($1, $2, 'approved', $3)`,
      [ticketId, user.user_id, note]
    );
    await notify(client, {
      userIds: [ticket.requester_id],
      ticketId,
      actorId: user.user_id,
      type: "approval_decided",
      title: `${fullName(user)} approved ${ticketRef(ticketId)}`,
      body: note ?? `${ticket.title} is now with the team.`,
    });
  });
  sendPendingSoon();
  return loadResponseTicket(ticketId, true);
};

/** POST /api/tickets/:id/reject { reason }: Cancelled, the reason is shown to the requester */
export const rejectTicket = async (ticketId: number, user: User, rawReason: unknown): Promise<TicketDetail> => {
  const reason = cleanNote(rawReason);
  await withTransaction(async (client) => {
    const { ticket, access } = await lockTicket(client, ticketId, user);
    if (!isDepartmentLead(access, ticket)) {
      throw new HttpError(403, "Only the department lead can reject this request.");
    }
    if (ticket.ticket_status !== "Pending approval") {
      throw new HttpError(409, `This ticket is ${ticket.ticket_status}, so there is nothing to reject.`);
    }
    if (!reason) throw new HttpError(400, "A reason is required to reject a request.");
    await client.query(`UPDATE ticket SET ticket_status = 'Cancelled', updated_at = now() WHERE ticket_id = $1`, [
      ticketId,
    ]);
    await logEvent(client, {
      ticketId,
      actorId: user.user_id,
      type: "rejected",
      from: "Pending approval",
      to: "Cancelled",
      note: reason,
    });
    await client.query(
      `INSERT INTO ticket_approval (ticket_id, approver_id, decision, reason) VALUES ($1, $2, 'rejected', $3)`,
      [ticketId, user.user_id, reason]
    );
    await notify(client, {
      userIds: [ticket.requester_id],
      ticketId,
      actorId: user.user_id,
      type: "approval_decided",
      title: `${fullName(user)} rejected ${ticketRef(ticketId)}`,
      body: reason,
    });
  });
  sendPendingSoon();
  return loadResponseTicket(ticketId, true);
};
