// S9 In-app notifications (briefing p.18, p.51, p.68): the read side. Everyone sees ONLY their own
// notifications (every query is scoped by user_id; someone else's id answers 404). The write side,
// notify(), lives in services/notify.ts and runs inside each change's transaction.
import { pool } from "../config/database";
import { HttpError } from "../utils/httpError";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, notificationPathFor, type NotificationType } from "./notify";

export interface AppNotification {
  notification_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  ticket_id: number | null;
  actor: { user_id: string; name: string } | null;
  read_at: Date | null;
  created_at: Date;
  path: string | null;
}

export interface NotificationPref {
  type: NotificationType;
  label: string;
  email: boolean;
}

export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;

interface Viewer {
  user_id: string;
  role: string;
}

interface NotificationRow {
  notification_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  ticket_id: number | null;
  actor_id: string | null;
  actor_name: string | null;
  read_at: Date | null;
  created_at: Date;
}

const SELECT = `
  SELECT n.notification_id::text AS notification_id, n.type, n.title, n.body, n.ticket_id,
         n.actor_id::text AS actor_id,
         NULLIF(TRIM(CONCAT(a.name, ' ', a.surname)), '') AS actor_name,
         n.read_at, n.created_at
  FROM notification n
  LEFT JOIN users a ON a.user_id = n.actor_id`;

/** Where clicking the item goes for this user: the survey for csat_requested, else their ticket page */
const pathFor = (row: NotificationRow, role: string): string | null => {
  if (row.ticket_id === null) return null;
  return notificationPathFor(role, row.type, row.ticket_id);
};

const toNotification = (row: NotificationRow, role: string): AppNotification => ({
  notification_id: row.notification_id,
  type: row.type,
  title: row.title,
  body: row.body,
  ticket_id: row.ticket_id,
  actor: row.actor_id ? { user_id: row.actor_id, name: row.actor_name ?? "Someone" } : null,
  read_at: row.read_at,
  created_at: row.created_at,
  path: pathFor(row, role),
});

/** Unread count for the bell (polled every 30 s) */
export const countUnread = async (userId: string): Promise<number> => {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM notification WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0].n;
};

/** GET /api/notifications: own only, newest first, plus the unread count */
export const listNotifications = async (
  viewer: Viewer,
  options: { unreadOnly: boolean; limit: number }
): Promise<{ notifications: AppNotification[]; unread: number }> => {
  const { rows } = await pool.query<NotificationRow>(
    `${SELECT}
     WHERE n.user_id = $1 ${options.unreadOnly ? "AND n.read_at IS NULL" : ""}
     ORDER BY n.created_at DESC, n.notification_id DESC
     LIMIT $2`,
    [viewer.user_id, options.limit]
  );
  const unread = await countUnread(viewer.user_id);
  return { notifications: rows.map((r) => toNotification(r, viewer.role)), unread };
};

/** PATCH /api/notifications/:id/read: someone else's (or a missing) notification is 404 */
export const markRead = async (viewer: Viewer, notificationId: string): Promise<AppNotification> => {
  const updated = await pool.query(
    `UPDATE notification SET read_at = COALESCE(read_at, now())
     WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, viewer.user_id]
  );
  if (!updated.rowCount) throw new HttpError(404, "Notification not found.");
  const { rows } = await pool.query<NotificationRow>(`${SELECT} WHERE n.notification_id = $1`, [notificationId]);
  return toNotification(rows[0], viewer.role);
};

/** POST /api/notifications/read-all -> how many were unread */
export const markAllRead = async (userId: string): Promise<number> => {
  const { rowCount } = await pool.query(
    `UPDATE notification SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rowCount ?? 0;
};

// ---------------------------------------------------------------------------------------------
// Email preferences per type (p.68). No row = email on. In-app is always on.
// ---------------------------------------------------------------------------------------------

/** What a requester hears about (everyone can raise a request) */
const REQUESTER_TYPES: NotificationType[] = [
  "reply_added",
  "status_changed",
  "approval_decided",
  "csat_requested",
  "department_changed",
];

/** The types each role can receive (p.18 recipients), in NOTIFICATION_TYPES order */
export const typesForRole = (role: string): NotificationType[] => {
  const wanted = new Set<NotificationType>(REQUESTER_TYPES);
  if (role === "Agent" || role === "Department Lead") {
    wanted.add("assigned");
    wanted.add("sla_breached");
  }
  if (role === "Department Lead") {
    wanted.add("approval_waiting");
    wanted.add("low_csat");
  }
  if (role === "System Admin" || role === "Platform Admin") return [];
  return NOTIFICATION_TYPES.filter((t) => wanted.has(t));
};

/** GET /api/me/notification-prefs: one per type relevant to the role */
export const getPrefs = async (viewer: Viewer): Promise<NotificationPref[]> => {
  const { rows } = await pool.query<{ type: NotificationType; email: boolean }>(
    `SELECT type, email FROM notification_pref WHERE user_id = $1`,
    [viewer.user_id]
  );
  const saved = new Map(rows.map((r) => [r.type, r.email]));
  return typesForRole(viewer.role).map((type) => ({
    type,
    label: NOTIFICATION_TYPE_LABELS[type],
    email: saved.get(type) ?? true,
  }));
};

/**
 * Checks a PUT body: { prefs: [{ type, email }] }. 400 for anything but known types with a boolean.
 * Returns the cleaned list (last entry wins for a repeated type).
 */
export const parsePrefs = (body: unknown): Array<{ type: NotificationType; email: boolean }> => {
  const prefs = (body as { prefs?: unknown } | null)?.prefs;
  if (!Array.isArray(prefs)) throw new HttpError(400, "Send prefs as a list of { type, email }.");
  if (prefs.length > NOTIFICATION_TYPES.length * 2) throw new HttpError(400, "Too many preferences.");
  const clean = new Map<NotificationType, boolean>();
  for (const item of prefs) {
    const type = (item as { type?: unknown } | null)?.type;
    const email = (item as { email?: unknown } | null)?.email;
    if (typeof type !== "string" || !(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
      throw new HttpError(400, `Unknown notification type: ${String(type)}.`);
    }
    if (typeof email !== "boolean") throw new HttpError(400, `email must be true or false for ${type}.`);
    clean.set(type as NotificationType, email);
  }
  return [...clean].map(([type, email]) => ({ type, email }));
};

/** PUT /api/me/notification-prefs: saves the email switches, answers the full list */
export const savePrefs = async (
  viewer: Viewer,
  prefs: Array<{ type: NotificationType; email: boolean }>
): Promise<NotificationPref[]> => {
  const allowed = typesForRole(viewer.role);
  const foreign = prefs.find((p) => !allowed.includes(p.type));
  if (foreign) throw new HttpError(400, `Your role doesn't get "${NOTIFICATION_TYPE_LABELS[foreign.type]}" notifications.`);
  if (prefs.length) {
    await pool.query(
      `INSERT INTO notification_pref (user_id, type, email)
       SELECT $1, p.type, p.email FROM unnest($2::text[], $3::boolean[]) AS p(type, email)
       ON CONFLICT (user_id, type) DO UPDATE SET email = EXCLUDED.email`,
      [viewer.user_id, prefs.map((p) => p.type), prefs.map((p) => p.email)]
    );
  }
  return getPrefs(viewer);
};
