import { useCallback, useEffect, useRef, useState } from "react";
import { countTickets, listTickets } from "@/services/tickets";
import { toApiError, type ApiError } from "@/services/apiClient";
import type { Ticket, TicketListParams } from "@/types/api";

interface TicketListState {
  tickets: Ticket[];
  /** Matching tickets on the server (pagination.total), before any browser-side `filter` */
  total: number;
  loading: boolean;
  /** A refresh is running while the old rows stay on screen */
  refetching: boolean;
  error: ApiError | null;
}

interface UseTicketListOptions {
  /** Browser-side narrowing the API has no parameter for */
  filter?: (ticket: Ticket, now: number) => boolean;
  /** Skip the request (e.g. until the user is known) */
  enabled?: boolean;
  /** Refresh quietly when the window regains focus (default true) */
  refreshOnFocus?: boolean;
}

/**
 * GET /api/tickets for one view (docs/api-sprint-1.md "Queue views"). The server scopes by role
 * and sorts (`sort=due`: breached first, then nearest due), so the page never re-sorts.
 * `params` may be a new object every render: the request only reruns when its contents change.
 */
export function useTicketList(params: TicketListParams, { filter, enabled = true, refreshOnFocus = true }: UseTicketListOptions = {}) {
  const key = JSON.stringify({ limit: 100, ...params });
  const [state, setState] = useState<TicketListState>({ tickets: [], total: 0, loading: true, refetching: false, error: null });
  const request = useRef(0);
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "quiet") => {
      const id = ++request.current;
      setState((s) => ({
        ...s,
        loading: mode === "initial",
        refetching: mode === "refresh",
        error: mode === "quiet" ? s.error : null,
      }));
      try {
        const response = await listTickets(JSON.parse(key) as TicketListParams);
        if (id !== request.current) return;
        const now = Date.now();
        const narrow = filterRef.current;
        const tickets = narrow ? response.tickets.filter((t) => narrow(t, now)) : response.tickets;
        setState({ tickets, total: response.pagination?.total ?? tickets.length, loading: false, refetching: false, error: null });
      } catch (err) {
        if (id !== request.current) return;
        // A quiet refresh keeps the rows it has; only a visible load shows the error state
        setState((s) =>
          mode === "quiet" ? { ...s, refetching: false } : { ...s, loading: false, refetching: false, error: toApiError(err) },
        );
      }
    },
    [key],
  );

  useEffect(() => {
    if (!enabled) return;
    void load("initial");
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !refreshOnFocus) return;
    const onFocus = () => void load("quiet");
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refreshOnFocus, load]);

  /** Shows the spinner on Refresh; rows stay visible */
  const refetch = useCallback(() => load("refresh"), [load]);
  /** No spinner: after a claim, an assignment or a 409 */
  const refresh = useCallback(() => load("quiet"), [load]);

  return { ...state, loading: enabled ? state.loading : false, refetch, refresh };
}

/** Just the number of tickets a view holds (pagination.total of a 1-row request) */
export function useTicketCount(params: TicketListParams, enabled = true) {
  const key = JSON.stringify(params);
  const [count, setCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // The first load shares the sidebar's request; a reload (after a change) asks again
    countTickets(JSON.parse(key) as TicketListParams, { fresh: tick > 0 })
      .then((total) => !cancelled && setCount(total))
      .catch(() => !cancelled && setCount(null));
    return () => {
      cancelled = true;
    };
  }, [key, enabled, tick]);

  return { count, reload: useCallback(() => setTick((t) => t + 1), []) };
}
