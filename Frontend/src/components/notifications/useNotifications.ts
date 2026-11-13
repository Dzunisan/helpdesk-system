import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTIFICATION_POLL_MS,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";
import { toApiError, type ApiError } from "@/services/apiClient";
import type { AppNotification } from "@/types/api";

interface PanelState {
  items: AppNotification[] | null;
  loading: boolean;
  error: ApiError | null;
}

/**
 * The bell's data (S9, briefing p.18, p.51): the unread count, polled every 30 seconds while the
 * tab is visible (and on focus), plus the panel's list, loaded when it opens. No websockets, no
 * paid push. `onArrived` fires when the count goes up between two polls, with the newest unread item.
 */
export function useNotifications({
  enabled = true,
  onArrived,
}: { enabled?: boolean; onArrived?: (latest: AppNotification) => void } = {}) {
  const [unread, setUnread] = useState(0);
  const [panel, setPanel] = useState<PanelState>({ items: null, loading: false, error: null });
  const lastCount = useRef<number | null>(null);
  const arrivedRef = useRef(onArrived);
  useEffect(() => {
    arrivedRef.current = onArrived;
  }, [onArrived]);

  const poll = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      const before = lastCount.current;
      lastCount.current = count;
      setUnread(count);
      if (before !== null && count > before && arrivedRef.current) {
        const { notifications } = await listNotifications({ unread: true, limit: 1 });
        if (notifications[0]) arrivedRef.current(notifications[0]);
      }
    } catch {
      // The bell stays quiet when the count can't load; the next poll tries again
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void poll();
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const id = window.setInterval(tick, NOTIFICATION_POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [enabled, poll]);

  const load = useCallback(async () => {
    setPanel((s) => ({ ...s, loading: true, error: null }));
    try {
      const { notifications, unread: count } = await listNotifications({ limit: 30 });
      lastCount.current = count;
      setUnread(count);
      setPanel({ items: notifications, loading: false, error: null });
    } catch (err) {
      setPanel((s) => ({ ...s, loading: false, error: toApiError(err) }));
    }
  }, []);

  /** Optimistic: the dot clears at once; a failure puts it back */
  const markRead = useCallback(async (item: AppNotification) => {
    if (item.read_at) return;
    const at = new Date().toISOString();
    const patch = (read_at: string | null) =>
      setPanel((s) => ({
        ...s,
        items: s.items?.map((n) => (n.notification_id === item.notification_id ? { ...n, read_at } : n)) ?? null,
      }));
    patch(at);
    setUnread((n) => Math.max(0, n - 1));
    lastCount.current = Math.max(0, (lastCount.current ?? 1) - 1);
    try {
      await markNotificationRead(item.notification_id);
    } catch {
      patch(null);
      setUnread((n) => n + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const at = new Date().toISOString();
    const previous = panel.items;
    const previousCount = unread;
    setPanel((s) => ({ ...s, items: s.items?.map((n) => (n.read_at ? n : { ...n, read_at: at })) ?? null }));
    setUnread(0);
    lastCount.current = 0;
    try {
      await markAllNotificationsRead();
      return true;
    } catch (err) {
      setPanel((s) => ({ ...s, items: previous }));
      setUnread(previousCount);
      lastCount.current = previousCount;
      throw toApiError(err);
    }
  }, [panel.items, unread]);

  return { unread, panel, load, markRead, markAllRead, refreshCount: poll };
}
