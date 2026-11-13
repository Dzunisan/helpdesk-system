import { useCallback, useEffect, useRef, useState } from "react";
import { getTicket, getTicketActions, getTimeline } from "@/services/tickets";
import { toApiError } from "@/services/apiClient";
import type { Ticket, TicketActionsResponse, TimelineItem } from "@/types/api";

export type StaffTicketState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      ticket: Ticket;
      /** null while loading; `actionsError` when GET /actions failed */
      actions: TicketActionsResponse | null;
      actionsError: string | null;
      timeline: TimelineItem[] | null;
      timelineError: string | null;
    };

/** The state plus which ticket it belongs to, so switching tickets shows the skeleton */
type Stored = StaffTicketState & { forId: number };

/**
 * One ticket for the staff inbox (briefing p.48): GET /tickets/:id, then /actions and /timeline
 * side by side. 404 (and 400 for a bad id) reads "Ticket not found" so the page never admits a
 * ticket from another department exists. `reload()` refreshes all three without a skeleton.
 */
export function useStaffTicket(id: string | undefined) {
  const ticketId = Number(id);
  const valid = !!id && Number.isInteger(ticketId) && ticketId > 0;
  const [stored, setStored] = useState<Stored>({ status: "loading", forId: NaN });
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!valid) return;
    const requestId = ++request.current;
    let ticket: Ticket;
    try {
      ticket = await getTicket(ticketId);
    } catch (err) {
      if (requestId !== request.current) return;
      const error = toApiError(err);
      setStored(
        [400, 403, 404].includes(error.status)
          ? { status: "notFound", forId: ticketId }
          : { status: "error", message: error.message, forId: ticketId },
      );
      return;
    }
    if (requestId !== request.current) return;
    // Show the ticket at once; a reload keeps the old actions and timeline until the new ones land
    setStored((prev) =>
      prev.status === "ready" && prev.forId === ticketId
        ? { ...prev, ticket }
        : { status: "ready", ticket, actions: null, actionsError: null, timeline: null, timelineError: null, forId: ticketId },
    );
    const [actions, timeline] = await Promise.allSettled([getTicketActions(ticketId), getTimeline(ticketId)]);
    if (requestId !== request.current) return;
    setStored((prev) =>
      prev.status !== "ready"
        ? prev
        : {
            ...prev,
            actions: actions.status === "fulfilled" ? actions.value : null,
            actionsError: actions.status === "rejected" ? toApiError(actions.reason).message : null,
            timeline: timeline.status === "fulfilled" ? timeline.value.items : null,
            timelineError: timeline.status === "rejected" ? toApiError(timeline.reason).message : null,
          },
    );
  }, [ticketId, valid]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Swap in the ticket a mutation returned, before the quiet reload lands */
  const setTicket = useCallback(
    (ticket: Ticket) => setStored((prev) => (prev.status === "ready" ? { ...prev, ticket } : prev)),
    [],
  );

  /** From an error or not-found state: back to the skeleton and load again */
  const retry = useCallback(() => {
    setStored({ status: "loading", forId: ticketId });
    return load();
  }, [load, ticketId]);

  const state: StaffTicketState = !valid
    ? { status: "notFound" }
    : stored.forId !== ticketId
      ? { status: "loading" }
      : stored;

  return { state, reload: load, retry, setTicket };
}
