// S9 In-app notifications (briefing p.18). Contract: docs/api-sprint-2.md "S9". The write side
// (notify(), outbox, jobs) is in services/notify.ts, services/outbox.ts and services/jobs.ts; the
// read side is services/notificationService.ts. Everyone, only their own.
import { Request, Response } from "express";
import * as notifications from "../services/notificationService";
import { HttpError, sendError } from "../utils/httpError";

const LABEL = "Notification error";

/** Notification ids are bigserial: digits only */
const parseNotificationId = (value: unknown): string => {
  const text = String(Array.isArray(value) ? value[0] : (value ?? "")).trim();
  if (!/^\d{1,18}$/.test(text)) throw new HttpError(400, "Invalid notification ID.");
  return text;
};

/** ?unread=1 / true -> unread only */
const isOn = (value: unknown) => ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());

const parseLimit = (value: unknown): number => {
  if (value === undefined || value === "") return notifications.DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "limit must be a whole number from 1.");
  return Math.min(n, notifications.MAX_LIMIT);
};

/** GET /api/notifications?unread=1&limit=30 (everyone: their own, newest first) */
export const listNotifications = async (req: Request, res: Response) => {
  try {
    const result = await notifications.listNotifications(req.user!, {
      unreadOnly: isOn(req.query.unread),
      limit: parseLimit(req.query.limit),
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** GET /api/notifications/count -> { unread } (the bell polls every 30 s) */
export const countNotifications = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ unread: await notifications.countUnread(req.user!.user_id) });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** PATCH /api/notifications/:id/read (404 for anyone else's) */
export const markRead = async (req: Request, res: Response) => {
  try {
    const notification = await notifications.markRead(req.user!, parseNotificationId(req.params.id));
    return res.status(200).json({ notification });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** POST /api/notifications/read-all -> { updated } */
export const markAllRead = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ updated: await notifications.markAllRead(req.user!.user_id) });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** GET /api/me/notification-prefs -> { prefs: [{ type, label, email }] } */
export const getPrefs = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ prefs: await notifications.getPrefs(req.user!) });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** PUT /api/me/notification-prefs { prefs: [{ type, email }] } (400 unknown type) */
export const savePrefs = async (req: Request, res: Response) => {
  try {
    const prefs = notifications.parsePrefs(req.body);
    return res.status(200).json({
      message: "Notification settings saved.",
      prefs: await notifications.savePrefs(req.user!, prefs),
    });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};
