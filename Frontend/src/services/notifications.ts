/**
 * S9 in-app notifications and email preferences (docs/api-sprint-2.md "S9"). Everyone, only their
 * own. The bell polls getUnreadCount() every 30 seconds (no websockets, no paid push).
 */
import { api, call } from "./apiClient";
import type {
  AppNotification,
  NotificationCountResponse,
  NotificationListParams,
  NotificationListResponse,
  NotificationPref,
  NotificationPrefsResponse,
  SaveNotificationPrefsRequest,
} from "@/types/api";

/** How often the bell asks for the unread count */
export const NOTIFICATION_POLL_MS = 30_000;

/** GET /api/notifications?unread=1&limit=30: newest first, plus the unread count */
export const listNotifications = (params: NotificationListParams = {}) =>
  call(
    () =>
      api.get<NotificationListResponse>("/notifications", {
        params: { ...params, unread: params.unread ? 1 : undefined },
      }),
    "Couldn't load notifications.",
  );

/** GET /api/notifications/count */
export const getUnreadCount = async (): Promise<number> =>
  (await call(() => api.get<NotificationCountResponse>("/notifications/count"), "Couldn't count notifications.")).unread;

/** PATCH /api/notifications/:id/read */
export const markNotificationRead = async (id: string): Promise<AppNotification> =>
  (
    await call(
      () => api.patch<{ notification: AppNotification }>(`/notifications/${id}/read`),
      "Couldn't mark the notification as read.",
    )
  ).notification;

/** POST /api/notifications/read-all -> { updated } */
export const markAllNotificationsRead = async (): Promise<number> =>
  (await call(() => api.post<{ updated: number }>("/notifications/read-all"), "Couldn't mark everything as read.")).updated;

/** GET /api/me/notification-prefs: every type with its email setting (in-app is always on) */
export const getNotificationPrefs = async (): Promise<NotificationPref[]> =>
  (await call(() => api.get<NotificationPrefsResponse>("/me/notification-prefs"), "Couldn't load your notification settings.")).prefs;

/** PUT /api/me/notification-prefs */
export const saveNotificationPrefs = async (body: SaveNotificationPrefsRequest): Promise<NotificationPref[]> =>
  (await call(() => api.put<NotificationPrefsResponse>("/me/notification-prefs", body), "Couldn't save your notification settings.")).prefs;
