import type { Ticket } from "@/types/api";

export interface SlaClock {
  /** Which promise the chip is about */
  kind: "first_response" | "resolution";
  due: string | null;
  /** When the clock stopped in time or late; null while running */
  met: string | null;
  start: string;
}

type ClockTicket = Pick<
  Ticket,
  "ticket_status" | "created_at" | "first_response_due_at" | "first_response_at" | "resolution_due_at" | "resolved_at" | "closed_at"
>;

/**
 * The one clock a list row shows (briefing p.12, p.47): the nearest unmet target, the same rule
 * the server sorts by (services/sla.ts nextDueAt). First response until someone replies, then
 * resolution; finished tickets show how the resolution went. Pending approval and Cancelled
 * tickets have no clock (null).
 */
export function rowClock(ticket: ClockTicket): SlaClock | null {
  const status = ticket.ticket_status;
  if (status === "Cancelled" || status === "Pending approval") return null;
  if (ticket.resolved_at || status === "Resolved" || status === "Closed") {
    if (!ticket.resolution_due_at) return null;
    return { kind: "resolution", due: ticket.resolution_due_at, met: ticket.resolved_at ?? ticket.closed_at, start: ticket.created_at };
  }
  if (!ticket.first_response_at && ticket.first_response_due_at)
    return { kind: "first_response", due: ticket.first_response_due_at, met: null, start: ticket.created_at };
  if (!ticket.resolution_due_at) return null;
  return { kind: "resolution", due: ticket.resolution_due_at, met: null, start: ticket.created_at };
}

/** Both clocks for the properties panel (first response, resolution) */
export function ticketClocks(ticket: ClockTicket): { firstResponse: SlaClock | null; resolution: SlaClock | null } {
  if (ticket.ticket_status === "Pending approval") return { firstResponse: null, resolution: null };
  return {
    firstResponse: ticket.first_response_due_at
      ? {
          kind: "first_response",
          due: ticket.first_response_due_at,
          // Resolving also counts as the response (services/sla.ts slaState)
          met: ticket.first_response_at ?? ticket.resolved_at,
          start: ticket.created_at,
        }
      : null,
    resolution: ticket.resolution_due_at
      ? { kind: "resolution", due: ticket.resolution_due_at, met: ticket.resolved_at, start: ticket.created_at }
      : null,
  };
}

/** The nearest unmet due time in ms, or null (finished, cancelled, no clock) */
export function nextDueMs(ticket: ClockTicket): number | null {
  const clock = rowClock(ticket);
  if (!clock || clock.met || !clock.due) return null;
  const ms = new Date(clock.due).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** "30m", "1h", "4h 30m", "3d": an SLA target length */
export function formatTarget(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
  const days = Math.floor(m / (24 * 60));
  const hours = Math.floor((m % (24 * 60)) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** Minutes between two timestamps */
export const minutesBetween = (from: string | number | Date, to: string | number | Date) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 60_000;
