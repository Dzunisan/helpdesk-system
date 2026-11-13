// S9 In-app notifications (briefing p.18). OWNER: the notifications feature. Contract:
// docs/api-sprint-2.md "S9". The write side (notify(), outbox, jobs) is in services/notify.ts,
// services/outbox.ts and services/jobs.ts.
import { notImplemented } from "../utils/notImplemented";

/** GET /api/notifications?unread=1&limit=30 (everyone: their own, newest first) */
export const listNotifications = notImplemented("S9 GET /api/notifications");

/** GET /api/notifications/count -> { unread } (the bell polls every 30 s) */
export const countNotifications = notImplemented("S9 GET /api/notifications/count");

/** PATCH /api/notifications/:id/read */
export const markRead = notImplemented("S9 PATCH /api/notifications/:id/read");

/** POST /api/notifications/read-all */
export const markAllRead = notImplemented("S9 POST /api/notifications/read-all");

/** GET /api/me/notification-prefs */
export const getPrefs = notImplemented("S9 GET /api/me/notification-prefs");

/** PUT /api/me/notification-prefs { prefs: [{ type, email }] } */
export const savePrefs = notImplemented("S9 PUT /api/me/notification-prefs");
