// S9 In-app notifications (briefing p.18). The write side: every change that should tell someone
// something calls notify() with the SAME transaction client as the change and its logEvent(), so the
// change, its history and its notifications commit or roll back together.
//
// notify() writes one `notification` row per recipient (in-app is always on) and, for recipients
// whose notification_pref says email is on (no row = on), one QUEUED `outbox` row with an
// HTML-escaped body. Nothing is sent here: call sendPendingSoon() (services/outbox.ts) AFTER the
// transaction commits.
//
// Recipients (p.18): the requester for public replies and status changes; the assignee for
// assignments; the department lead for breaches, approvals waiting and low CSAT. NEVER the person
// who did it: the actor is always removed from userIds.
import type { PoolClient } from "pg";
import { escapeHtml } from "../utils/escapeHtml";
import { clientUrl } from "../utils/smtp";

export const NOTIFICATION_TYPES = [
  "reply_added",
  "assigned",
  "status_changed",
  "approval_waiting",
  "approval_decided",
  "sla_breached",
  "low_csat",
  "csat_requested",
  "department_changed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Labels for the profile's notification preferences (p.68) and the email footer */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  reply_added: "Replies on my tickets",
  assigned: "Tickets assigned to me",
  status_changed: "Status changes on my requests",
  approval_waiting: "Requests waiting for my approval",
  approval_decided: "Approval decisions on my requests",
  sla_breached: "Breached tickets in my department",
  low_csat: "Low ratings in my department",
  csat_requested: "Rating requests for closed tickets",
  department_changed: "Tickets moved between departments",
};

type Id = string | number;

export interface NotifyInput {
  /** Who to tell. Null/undefined entries, duplicates, inactive users and the actor are dropped. */
  userIds: Array<Id | null | undefined>;
  ticketId: number | null;
  /** Who did it (never notified); null = the system (jobs runner, auto-close) */
  actorId: Id | null;
  type: NotificationType;
  /** One plain-text line: "Thabo Nkosi replied on HD-1048". Escaped when it goes into an email. */
  title: string;
  /** Optional second line (plain text), e.g. the first words of the reply */
  body?: string | null;
  /** Optional path inside the app for the email button; defaults to the ticket page for the recipient's role */
  path?: string | null;
}

export interface NotifyResult {
  notificationIds: string[];
  /** outbox ids queued for email */
  outboxIds: string[];
}

const MAX_TITLE = 300;
const MAX_BODY = 280;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "HD-1048" */
export const ticketRef = (ticketId: number | string) => `HD-${ticketId}`;

/** The ticket page a recipient opens, by role (same routes as Frontend/src/routes/AppRouter.tsx) */
export const ticketPathFor = (role: string, ticketId: number): string => {
  if (role === "Agent") return `/agent/tickets/${ticketId}`;
  if (role === "Department Lead") return `/department-lead/tickets/${ticketId}`;
  return `/employee/tickets/${ticketId}`;
};

/** The email's HTML. Every interpolated value goes through escapeHtml (p.18: a <script> title shows as text). */
export const renderNotificationEmail = (input: {
  recipientName: string;
  title: string;
  body?: string | null;
  url: string | null;
  type: NotificationType;
}): string => {
  const button = input.url
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in the helpdesk</a></p>`
    : "";
  const body = input.body ? `<p style="color:#52525b;white-space:pre-wrap">${escapeHtml(input.body)}</p>` : "";
  return `<div style="font-family:Arial,sans-serif;padding:20px;color:#18181b;max-width:560px">
  <p>Hi ${escapeHtml(input.recipientName)},</p>
  <p style="font-size:16px;font-weight:600">${escapeHtml(input.title)}</p>
  ${body}
  ${button}
  <p style="color:#71717a;font-size:12px">You get this email for "${escapeHtml(NOTIFICATION_TYPE_LABELS[input.type])}". Change it under Profile, Notifications.</p>
</div>`;
};

/**
 * Inserts notifications (and queued emails) inside the caller's transaction. Returns the new ids.
 * @example
 *   await withTransaction(async (client) => {
 *     ...change + logEvent...
 *     await notify(client, { userIds: [ticket.requester_id], ticketId, actorId: user.user_id,
 *                            type: "reply_added", title: `${fullName(user)} replied on HD-${ticketId}`, body });
 *   });
 *   sendPendingSoon(); // after commit
 */
export const notify = async (client: PoolClient, input: NotifyInput): Promise<NotifyResult> => {
  const actor = input.actorId === null || input.actorId === undefined ? null : String(input.actorId);
  const ids = [
    ...new Set(
      input.userIds
        .filter((id): id is Id => id !== null && id !== undefined && String(id).trim() !== "")
        .map((id) => String(id))
        .filter((id) => /^\d{1,18}$/.test(id) && id !== actor)
    ),
  ];
  const result: NotifyResult = { notificationIds: [], outboxIds: [] };
  if (ids.length === 0) return result;

  const title = clip(input.title.trim(), MAX_TITLE);
  const body = input.body ? clip(input.body.replace(/\s+/g, " ").trim(), MAX_BODY) : null;

  // Recipients: active users only, with their email preference for this type (no row = on)
  const { rows: recipients } = await client.query<{
    user_id: string;
    email: string | null;
    name: string;
    role: string;
    wants_email: boolean;
  }>(
    `SELECT u.user_id::text AS user_id, u.email, u.name, u.role::text AS role, COALESCE(p.email, true) AS wants_email
     FROM users u
     LEFT JOIN notification_pref p ON p.user_id = u.user_id AND p.type = $2
     WHERE u.user_id = ANY($1::bigint[]) AND u.active`,
    [ids, input.type]
  );

  for (const r of recipients) {
    const { rows } = await client.query<{ notification_id: string }>(
      `INSERT INTO notification (user_id, ticket_id, actor_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING notification_id::text AS notification_id`,
      [r.user_id, input.ticketId, actor, input.type, title, body]
    );
    const notificationId = rows[0].notification_id;
    result.notificationIds.push(notificationId);

    if (!r.wants_email || !r.email) continue;
    const path = input.path ?? (input.ticketId !== null ? ticketPathFor(r.role, input.ticketId) : null);
    const html = renderNotificationEmail({
      recipientName: r.name,
      title,
      body,
      url: path ? `${clientUrl()}${path}` : null,
      type: input.type,
    });
    const queued = await client.query<{ id: string }>(
      `INSERT INTO outbox (channel, recipient, user_id, notification_id, ticket_id, subject, body)
       VALUES ('email', $1, $2, $3, $4, $5, $6)
       RETURNING id::text AS id`,
      [r.email, r.user_id, notificationId, input.ticketId, title, html]
    );
    result.outboxIds.push(queued.rows[0].id);
  }
  return result;
};

/** The department's appointed lead (department.lead_id), or null */
export const departmentLeadId = async (client: PoolClient, departmentId: number | null): Promise<string | null> => {
  if (departmentId === null || departmentId === undefined) return null;
  const { rows } = await client.query<{ lead_id: string | null }>(
    `SELECT lead_id::text AS lead_id FROM department WHERE department_id = $1`,
    [departmentId]
  );
  return rows[0]?.lead_id ?? null;
};

/**
 * S10: the "How did we do?" survey for a ticket that just closed (employee confirmed, or the 5-day
 * auto-close). Stamps csat_requested_at once and notifies the requester; does nothing when the
 * survey was already sent or the ticket was already rated. Call inside the closing transaction.
 */
export const requestCsat = async (client: PoolClient, ticketId: number): Promise<boolean> => {
  const { rows } = await client.query<{ requester_id: string; title: string }>(
    `UPDATE ticket t SET csat_requested_at = now()
     WHERE t.ticket_id = $1 AND t.csat_requested_at IS NULL AND t.ticket_status = 'Closed'
       AND NOT EXISTS (SELECT 1 FROM ticket_feedback f WHERE f.ticket_id = t.ticket_id)
     RETURNING t.requester_id::text AS requester_id, t.title`,
    [ticketId]
  );
  const ticket = rows[0];
  if (!ticket) return false;
  await notify(client, {
    userIds: [ticket.requester_id],
    ticketId,
    actorId: null,
    type: "csat_requested",
    title: `How did we do on ${ticketRef(ticketId)}?`,
    body: `${ticket.title}. Rate the help you got, it takes ten seconds.`,
    path: `/employee/tickets/${ticketId}/feedback`,
  });
  return true;
};
