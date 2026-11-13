import type { Ticket } from "@/types/ticket.types";
import { PRIORITY_RANK, toPriority, toStatus, type Status } from "@/lib/ticketVocabulary";

/** Statuses an agent still has to work on (everything but resolved / closed / cancelled) */
export const ACTIVE_STATUSES: Status[] = ["new", "open", "waiting", "pending"];

export const isActive = (ticket: Ticket) => ACTIVE_STATUSES.includes(toStatus(ticket.ticket_status));

export const isDone = (ticket: Ticket) => {
  const status = toStatus(ticket.ticket_status);
  return status === "resolved" || status === "closed";
};

/** Nobody owns it yet. Assignee name comes back as "" from the API, so check the id. */
export const isUnassigned = (ticket: Ticket) => !ticket.assignee_id;

const time = (value: string | undefined | null) => (value ? new Date(value).getTime() || 0 : 0);

/**
 * Work order for queues: highest priority first, then oldest first, so old tickets never starve.
 * (There is no SLA due date in the data yet; this is the closest honest "most at risk" order.)
 */
export const byUrgency = (a: Ticket, b: Ticket) =>
  PRIORITY_RANK[toPriority(b.ticket_priority)] - PRIORITY_RANK[toPriority(a.ticket_priority)] ||
  time(a.created_at) - time(b.created_at);

/** Most recently touched first */
export const byRecentlyUpdated = (a: Ticket, b: Ticket) =>
  time(b.updated_at || b.created_at) - time(a.updated_at || a.created_at);

/** Least recently touched first */
export const byOldestUpdated = (a: Ticket, b: Ticket) => -byRecentlyUpdated(a, b);

/** Free-text match on "HD-1048", title, requester and category */
export const matchesSearch = (ticket: Ticket, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `hd-${ticket.ticket_id} ${ticket.ticket_id} ${ticket.title} ${ticket.requester_name ?? ""} ${ticket.category_name ?? ""}`
    .toLowerCase()
    .includes(q);
};

/** "1 ticket" / "3 tickets" */
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** "2026-11-13": the calendar day in SAST, for "today" filters */
export const sastDayKey = (value: string | number | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
