// S4 Conversation & activity timeline (briefing p.13). Contract: docs/api-sprint-1.md "S4".
// One merged, time-ordered list of events and comments, filtered by role ON THE SERVER: anyone who
// can't work the ticket (the requester) never receives internal notes or internal events.
// Comments are never hard-deleted: a deleted comment keeps its place with body null.
import { pool, withTransaction } from "../config/database";
import { logEvent } from "./events";
import { closeExpiredResolved } from "./ticketLifecycle";
import { COMMENT_SELECT } from "./ticketService";
import { TICKET_NOT_FOUND, TicketAccessUser, canView, canWork, isRequester, loadTicketAccess } from "./ticketAccess";
import { checkTransition, FINAL_STATUSES, TicketStatus } from "../types/ticket.types";
import type { User } from "../types/user.types";
import { HttpError } from "../utils/httpError";
import { sendTicketCommentEmail } from "../utils/emailService";

/** Authors may edit or delete their own comment for this long (page 13) */
export const COMMENT_EDIT_WINDOW_MINUTES = 15;
const EDIT_WINDOW_MS = COMMENT_EDIT_WINDOW_MINUTES * 60_000;
const MAX_BODY_LENGTH = 5000;

export interface TimelinePerson {
  user_id: string;
  name: string;
  role: string;
  department_name: string | null;
}

export interface TimelineEventItem {
  kind: "event";
  id: string;
  at: string;
  actor: TimelinePerson | null;
  type: string;
  from_value: string | null;
  to_value: string | null;
  from_label: string | null;
  to_label: string | null;
  note: string | null;
  is_internal: boolean;
}

export interface TimelineCommentItem {
  kind: "comment";
  id: string;
  at: string;
  actor: TimelinePerson;
  comment_id: number;
  body: string | null;
  is_internal: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  can_edit: boolean;
}

export type TimelineItem = TimelineEventItem | TimelineCommentItem;

/** The Comment shape of the contract (body null once deleted) */
export interface CommentDto {
  comment_id: number;
  ticket_id: number;
  author_id: string;
  author_name: string;
  author_email: string | null;
  author_role: string;
  author_department_name: string | null;
  body: string | null;
  is_internal: boolean;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
}

interface TicketRow {
  ticket_id: number;
  title: string;
  requester_id: string;
  assignee_id: string | null;
  ticket_department_id: number;
  ticket_status: TicketStatus;
  first_response_at: Date | null;
  resolved_at: Date | null;
  requester_email: string | null;
  requester_name: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
}

const TICKET_SELECT = `
  SELECT t.ticket_id, t.title, t.requester_id::text AS requester_id, t.assignee_id::text AS assignee_id,
         t.ticket_department_id, t.ticket_status, t.first_response_at, t.resolved_at,
         req.email AS requester_email, TRIM(CONCAT(req.name, ' ', req.surname)) AS requester_name,
         asg.email AS assignee_email, NULLIF(TRIM(CONCAT(asg.name, ' ', asg.surname)), '') AS assignee_name
  FROM ticket t
  LEFT JOIN users req ON req.user_id = t.requester_id
  LEFT JOIN users asg ON asg.user_id = t.assignee_id
  WHERE t.ticket_id = $1 AND t.deleted_at IS NULL`;

const fullName = (user: Pick<User, "name" | "surname">) => `${user.name} ${user.surname ?? ""}`.trim();

const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

const finalMessage = (status: TicketStatus) =>
  status === "Cancelled"
    ? "This request was cancelled. Start a new request."
    : "This ticket is closed. Start a new request.";

const cleanBody = (body: unknown): string => {
  if (typeof body !== "string" || body.trim().length === 0) throw new HttpError(400, "Write a message first.");
  const trimmed = body.trim();
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new HttpError(400, `A message can be at most ${MAX_BODY_LENGTH} characters.`);
  }
  return trimmed;
};

/** Loads the ticket and the caller's access; 404 when it doesn't exist or the caller can't see it */
const viewTicket = async (ticketId: number, user: User): Promise<{ ticket: TicketRow; access: TicketAccessUser }> => {
  const { rows } = await pool.query<TicketRow>(TICKET_SELECT, [ticketId]);
  const ticket = rows[0];
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  const access = await loadTicketAccess(user);
  if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
  return { ticket, access };
};

// ---------------------------------------------------------------------------------------------
// GET /api/tickets/:id/timeline
// ---------------------------------------------------------------------------------------------

/** Events whose values are user ids; the labels are the people's names */
const PERSON_EVENTS = new Set(["claimed", "assigned"]);

/** Order inside one timestamp: "created" first, then replies, then what they caused (Waiting -> Open) */
const rank = (item: TimelineItem) => (item.kind === "event" ? (item.type === "created" ? 0 : 2) : 1);

export const getTimeline = async (ticketId: number, user: User): Promise<TimelineItem[]> => {
  const { ticket, access } = await viewTicket(ticketId, user);
  const staff = canWork(access, ticket);
  const eventFilter = staff ? "" : "AND NOT e.is_internal";
  const commentFilter = staff ? "" : "AND NOT c.is_internal";

  const [eventsResult, commentsResult] = await Promise.all([
    pool.query(
      `SELECT e.event_id::text AS event_id, e.type, e.from_value, e.to_value, e.note, e.is_internal, e.created_at,
              e.actor_id::text AS actor_id, TRIM(CONCAT(u.name, ' ', u.surname)) AS actor_name,
              u.role AS actor_role, ud.department_name AS actor_department_name
       FROM ticket_event e
       LEFT JOIN users u ON u.user_id = e.actor_id
       LEFT JOIN department ud ON ud.department_id = u.department_id
       WHERE e.ticket_id = $1 ${eventFilter}
       ORDER BY e.created_at, e.event_id`,
      [ticketId]
    ),
    pool.query(`${COMMENT_SELECT} WHERE c.ticket_id = $1 ${commentFilter} ORDER BY c.created_at, c.comment_id`, [
      ticketId,
    ]),
  ]);

  // Names for claimed / assigned values (user ids)
  const personIds = new Set<string>();
  for (const e of eventsResult.rows) {
    if (!PERSON_EVENTS.has(e.type)) continue;
    if (e.from_value) personIds.add(e.from_value);
    if (e.to_value) personIds.add(e.to_value);
  }
  const names = new Map<string, string>();
  const ids = [...personIds].filter((id) => /^\d{1,18}$/.test(id));
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT user_id::text AS user_id, TRIM(CONCAT(name, ' ', surname)) AS name FROM users WHERE user_id = ANY($1::bigint[])`,
      [ids]
    );
    for (const row of rows) names.set(row.user_id, row.name);
  }
  const label = (type: string, value: string | null) =>
    value === null ? null : PERSON_EVENTS.has(type) ? names.get(value) ?? "Someone" : value;

  const now = Date.now();
  const items: TimelineItem[] = [
    ...eventsResult.rows.map(
      (e): TimelineEventItem => ({
        kind: "event",
        id: `e-${e.event_id}`,
        at: iso(e.created_at)!,
        actor: e.actor_id
          ? { user_id: e.actor_id, name: e.actor_name, role: e.actor_role, department_name: e.actor_department_name }
          : null,
        type: e.type,
        from_value: e.from_value,
        to_value: e.to_value,
        from_label: label(e.type, e.from_value),
        to_label: label(e.type, e.to_value),
        // A lead's reassignment reason ("Thabo is overloaded") is a staff matter (page 13): the
        // requester sees who has the ticket, not why it moved
        note: !staff && e.type === "assigned" ? null : e.note,
        is_internal: e.is_internal,
      })
    ),
    ...commentsResult.rows.map(
      (c: CommentDto): TimelineCommentItem => ({
        kind: "comment",
        id: `c-${c.comment_id}`,
        at: iso(c.created_at)!,
        actor: {
          user_id: c.author_id,
          name: c.author_name,
          role: c.author_role,
          department_name: c.author_department_name,
        },
        comment_id: c.comment_id,
        body: c.body,
        is_internal: c.is_internal,
        edited_at: iso(c.edited_at),
        deleted_at: iso(c.deleted_at),
        can_edit:
          sameId(c.author_id, user.user_id) &&
          !c.deleted_at &&
          !FINAL_STATUSES.includes(ticket.ticket_status) &&
          now - new Date(c.created_at).getTime() <= EDIT_WINDOW_MS,
      })
    ),
  ];

  // Stable merge: by time, then rank, then the order each list was already in
  const order = new Map(items.map((item, index) => [item, index]));
  items.sort((a, b) => {
    const byTime = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (byTime !== 0) return byTime;
    const byRank = rank(a) - rank(b);
    return byRank !== 0 ? byRank : order.get(a)! - order.get(b)!;
  });
  return items;
};

// ---------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------

const loadComment = async (commentId: number): Promise<CommentDto | null> => {
  const { rows } = await pool.query<CommentDto>(`${COMMENT_SELECT} WHERE c.comment_id = $1`, [commentId]);
  return rows[0] ?? null;
};

/** GET /api/tickets/:id/comments (older screens): the same role filter as the timeline */
export const listComments = async (ticketId: number, user: User): Promise<CommentDto[]> => {
  const { ticket, access } = await viewTicket(ticketId, user);
  const filter = canWork(access, ticket) ? "" : "AND NOT c.is_internal";
  const { rows } = await pool.query<CommentDto>(
    `${COMMENT_SELECT} WHERE c.ticket_id = $1 ${filter} ORDER BY c.created_at, c.comment_id`,
    [ticketId]
  );
  return rows;
};

/**
 * POST /api/tickets/:id/comments { body, is_internal? }. In the same transaction: the first public
 * reply by department staff stamps first_response_at (S3); the requester's reply on a Waiting on
 * employee ticket moves it back to Open with a status_changed event (S2).
 */
export const addComment = async (
  ticketId: number,
  user: User,
  rawBody: unknown,
  isInternal: boolean
): Promise<CommentDto> => {
  const body = cleanBody(rawBody);
  // A Resolved ticket past its 5-day window is Closed: no more comments
  await closeExpiredResolved(ticketId);
  let ticket!: TicketRow;
  const commentId = await withTransaction(async (client) => {
    const { rows } = await client.query<TicketRow>(`${TICKET_SELECT} FOR UPDATE OF t`, [ticketId]);
    ticket = rows[0];
    if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
    const access = await loadTicketAccess(user);
    if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);

    const staff = canWork(access, ticket);
    const requester = isRequester(access, ticket);
    if (isInternal && !staff) {
      throw new HttpError(403, "Only agents and leads of this ticket's department can write internal notes.");
    }
    if (FINAL_STATUSES.includes(ticket.ticket_status)) throw new HttpError(409, finalMessage(ticket.ticket_status));

    const inserted = await client.query(
      `INSERT INTO comment (ticket_id, author_id, body, is_internal, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       RETURNING comment_id`,
      [ticketId, user.user_id, body, isInternal]
    );

    if (!isInternal && staff && !requester && !ticket.first_response_at) {
      await client.query(
        `UPDATE ticket SET first_response_at = now(), updated_at = now() WHERE ticket_id = $1 AND first_response_at IS NULL`,
        [ticketId]
      );
    } else if (!isInternal && requester && ticket.ticket_status === "Waiting on employee") {
      const check = checkTransition(access, { ...ticket, ticket_status: "Waiting on employee" }, "Open");
      if (check.ok) {
        await client.query(`UPDATE ticket SET ticket_status = 'Open', updated_at = now() WHERE ticket_id = $1`, [ticketId]);
        await logEvent(client, {
          ticketId,
          actorId: user.user_id,
          type: "status_changed",
          from: "Waiting on employee",
          to: "Open",
        });
      }
    } else {
      await client.query(`UPDATE ticket SET updated_at = now() WHERE ticket_id = $1`, [ticketId]);
    }
    return inserted.rows[0].comment_id as number;
  });

  const comment = (await loadComment(commentId))!;
  notifyComment(ticket, user, body, isInternal);
  return comment;
};

/** Emails after commit, fire and forget: requester <-> owner; internal notes never reach the requester */
const notifyComment = (ticket: TicketRow, user: User, body: string, isInternal: boolean) => {
  const send = (recipientEmail: string | null, recipientName: string | null) => {
    if (!recipientEmail) return;
    sendTicketCommentEmail({
      recipientEmail,
      recipientName: recipientName || "there",
      ticketId: ticket.ticket_id,
      ticketTitle: ticket.title,
      authorName: fullName(user),
      authorRole: user.role,
      commentBody: body,
      isInternal,
    }).catch((err) => console.error("[ticketTimeline] Failed to send comment email:", err));
  };
  const byRequester = sameId(user.user_id, ticket.requester_id);
  const byAssignee = sameId(user.user_id, ticket.assignee_id);
  if (isInternal || byRequester) {
    if (!byAssignee) send(ticket.assignee_email, ticket.assignee_name);
  } else {
    send(ticket.requester_email, ticket.requester_name);
  }
};

/**
 * Checks for editing / deleting a comment: 404 when the caller can't see it (another department's
 * ticket, or an internal note for the requester), 403 not the author, 409 deleted or ticket final,
 * 403 once the 15-minute window has passed.
 */
const authorChecks = async (commentId: number, user: User, verb: "edit" | "delete") => {
  const comment = await loadComment(commentId);
  if (!comment) throw new HttpError(404, "Comment not found.");
  const { ticket, access } = await viewTicket(comment.ticket_id, user).catch((error) => {
    if (error instanceof HttpError && error.status === 404) throw new HttpError(404, "Comment not found.");
    throw error;
  });
  if (comment.is_internal && !canWork(access, ticket)) throw new HttpError(404, "Comment not found.");
  if (!sameId(comment.author_id, user.user_id)) {
    throw new HttpError(403, `Only the person who wrote this message can ${verb} it.`);
  }
  if (comment.deleted_at) throw new HttpError(409, "This message was already removed.");
  if (FINAL_STATUSES.includes(ticket.ticket_status)) throw new HttpError(409, finalMessage(ticket.ticket_status));
  if (Date.now() - new Date(comment.created_at).getTime() > EDIT_WINDOW_MS) {
    throw new HttpError(
      403,
      `Messages can only be ${verb === "edit" ? "edited" : "deleted"} within ${COMMENT_EDIT_WINDOW_MINUTES} minutes of sending.`
    );
  }
  return comment;
};

/** PATCH /api/comments/:id { body }: the author, within 15 minutes. Sets edited_at, one `comment_edited` event. */
export const editComment = async (commentId: number, user: User, rawBody: unknown): Promise<CommentDto> => {
  const body = cleanBody(rawBody);
  const comment = await authorChecks(commentId, user, "edit");
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE comment SET body = $1, edited_at = now(), updated_at = now()
       WHERE comment_id = $2 AND deleted_at IS NULL
         AND created_at > now() - make_interval(mins => $3::int)`,
      [body, commentId, COMMENT_EDIT_WINDOW_MINUTES]
    );
    if (!result.rowCount) throw new HttpError(409, "This message can't be edited any more.");
    await logEvent(client, {
      ticketId: comment.ticket_id,
      actorId: user.user_id,
      type: "comment_edited",
      to: String(commentId),
      isInternal: comment.is_internal,
    });
  });
  return (await loadComment(commentId))!;
};

/**
 * DELETE /api/comments/:id: soft delete. The row stays (deleted_at), the timeline shows
 * "Message removed by <name>", and one `comment_deleted` event is logged in the same transaction.
 */
export const deleteComment = async (commentId: number, user: User): Promise<CommentDto> => {
  const comment = await authorChecks(commentId, user, "delete");
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE comment SET deleted_at = now(), updated_at = now() WHERE comment_id = $1 AND deleted_at IS NULL`,
      [commentId]
    );
    if (!result.rowCount) throw new HttpError(409, "This message was already removed.");
    await logEvent(client, {
      ticketId: comment.ticket_id,
      actorId: user.user_id,
      type: "comment_deleted",
      to: String(commentId),
      isInternal: comment.is_internal,
    });
  });
  return (await loadComment(commentId))!;
};
