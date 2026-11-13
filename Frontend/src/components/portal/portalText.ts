/**
 * Plain-words helpers for the employee portal (briefing p.37-41, p.45). Every time is SAST.
 */
import { firstNameOf, formatAge, formatAgo, formatSast, type DateInput } from "@/lib/format";
import type { CategoryField, Ticket, TicketImpact, TicketStatus } from "@/types/api";

const DAY_MS = 86_400_000;

const toMs = (value: DateInput): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** "18:14 today", "11:30 tomorrow", otherwise "Fri 20 Nov, 09:00" (SAST) */
export function promiseTime(value: DateInput, now = Date.now()): string {
  const ms = toMs(value);
  if (ms === null) return "—";
  const day = formatSast(ms, "day");
  if (day === formatSast(now, "day")) return `${formatSast(ms, "time")} today`;
  if (day === formatSast(now + DAY_MS, "day")) return `${formatSast(ms, "time")} tomorrow`;
  return formatSast(ms);
}


/** The clock the employee is waiting on right now: first reply until someone replies, then the fix */
export function nextDueAt(ticket: Ticket): string | null {
  if (["Resolved", "Closed", "Cancelled", "Pending approval"].includes(ticket.ticket_status)) return null;
  if (!ticket.first_response_at) return ticket.first_response_due_at;
  return ticket.resolution_due_at;
}

export type PromiseTone = "muted" | "waiting" | "late" | "action";

/** The "next promise" line on a request row (p.37): "Update expected by 16:14 today" */
export function nextPromise(ticket: Ticket, now = Date.now()): { text: string; tone: PromiseTone } {
  switch (ticket.ticket_status) {
    case "Pending approval":
      return { text: `Waiting for approval · ${formatAge(ticket.created_at, now)}`, tone: "muted" };
    case "Waiting on employee":
      return {
        text: `${firstNameOf(ticket.assignee_name, "The team")} asked a question · ${formatAgo(ticket.updated_at)}`,
        tone: "waiting",
      };
    case "Resolved":
      return { text: "Is it fixed? Let us know", tone: "action" };
    case "Closed":
      return { text: `Closed ${formatSast(ticket.closed_at ?? ticket.updated_at, "day")}`, tone: "muted" };
    case "Cancelled":
      return { text: `Cancelled ${formatSast(ticket.updated_at, "day")}`, tone: "muted" };
    default: {
      const firstReply = !ticket.first_response_at;
      const due = nextDueAt(ticket);
      const dueMs = toMs(due);
      if (dueMs === null) return { text: "We'll update you soon", tone: "muted" };
      if (dueMs < now) {
        return { text: `Running late · due ${promiseTime(dueMs, now)}`, tone: "late" };
      }
      return {
        text: `${firstReply ? "First reply by" : "Update expected by"} ${promiseTime(dueMs, now)}`,
        tone: "muted",
      };
    }
  }
}

/** The five steps of the request progress bar (p.41) */
export const PROGRESS_STEPS = ["Submitted", "Assigned", "Being worked on", "Resolved", "Closed"] as const;

/** Index of the current step, or null when the bar doesn't apply (Cancelled) */
export function progressStep(ticket: Pick<Ticket, "ticket_status" | "assignee_id">): number | null {
  switch (ticket.ticket_status) {
    case "Pending approval":
    case "New":
      return ticket.assignee_id ? 1 : 0;
    case "Open":
    case "Waiting on employee":
      return 2;
    case "Resolved":
      return 3;
    case "Closed":
      return 4;
    default:
      return null;
  }
}

/** Statuses as the employee reads them: the ball is with "you", not "the employee" */
export function statusWords(status: string | null | undefined): string {
  if (status === "Waiting on employee") return "Waiting on you";
  return status ?? "";
}

export const IMPACT_LABEL: Record<TicketImpact, string> = {
  blocks_me: "Blocks me",
  slows_me_down: "Slows me down",
  minor: "Minor",
};

export const IMPACT_OPTIONS: { value: TicketImpact; label: string; hint: string }[] = [
  { value: "blocks_me", label: "Blocks me", hint: "I can't do my work" },
  { value: "slows_me_down", label: "Slows me down", hint: "There's a workaround" },
  { value: "minor", label: "Minor", hint: "It can wait" },
];

/** "software_name" -> "Software name", for answers whose category is no longer listed */
export const humanizeKey = (key: string): string => {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const RAND = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const NUMBER = new Intl.NumberFormat("en-ZA");

/** An extra field answer for reading: "R 3 960,00", "11 Nov 2026", or the text as typed */
export function formatAnswer(value: string | number | null, field?: CategoryField): string {
  if (value === null || value === "") return "—";
  if (field?.type === "number" && Number.isFinite(Number(value))) {
    const n = Number(value);
    if (field.unit === "ZAR") return RAND.format(n);
    return field.unit ? `${NUMBER.format(n)} ${field.unit}` : NUMBER.format(n);
  }
  if (field?.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    // A calendar date, not a moment: read it at noon so no time zone moves it a day
    return formatSast(`${value}T12:00:00+02:00`, "date");
  }
  return String(value);
}

/** Tabs on My requests (p.37) */
export type RequestTab = "active" | "waiting" | "resolved" | "closed" | "cancelled";

export const REQUEST_TABS: { key: RequestTab; label: string; statuses: TicketStatus[] }[] = [
  { key: "active", label: "Active", statuses: ["Pending approval", "New", "Open", "Waiting on employee"] },
  { key: "waiting", label: "Waiting on you", statuses: ["Waiting on employee"] },
  { key: "resolved", label: "Resolved", statuses: ["Resolved"] },
  { key: "closed", label: "Closed", statuses: ["Closed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["Cancelled"] },
];

export const isRequestTab = (value: string | null): value is RequestTab =>
  REQUEST_TABS.some((tab) => tab.key === value);
