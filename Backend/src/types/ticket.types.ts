import {
  TicketAccessTicket,
  TicketAccessUser,
  canWork,
  isDepartmentLead,
  isRequester,
} from "../services/ticketAccess";

// ---------------------------------------------------------------------------------------------
// Vocabulary (briefing p.4, p.31). Use these exact names everywhere; db/migrations/001 created them.
// ---------------------------------------------------------------------------------------------

export type TicketStatus =
  | "Pending approval"
  | "New"
  | "Open"
  | "Waiting on employee"
  | "Resolved"
  | "Closed"
  | "Cancelled";

export const VALID_STATUSES: TicketStatus[] = [
  "Pending approval",
  "New",
  "Open",
  "Waiting on employee",
  "Resolved",
  "Closed",
  "Cancelled",
];

/** Still needs someone to act: counts as backlog / "open work" */
export const ACTIVE_STATUSES: TicketStatus[] = ["Pending approval", "New", "Open", "Waiting on employee"];

/** Final: read-only, no more comments (page 4: "Closed and Cancelled are final") */
export const FINAL_STATUSES: TicketStatus[] = ["Closed", "Cancelled"];

export type TicketPriority = "Urgent" | "High" | "Normal" | "Low";
export const VALID_PRIORITIES: TicketPriority[] = ["Urgent", "High", "Normal", "Low"];
export const DEFAULT_PRIORITY: TicketPriority = "Normal";

/** "How is this affecting you?" on the new request form (page 39). Staff still set priority. */
export type TicketImpact = "blocks_me" | "slows_me_down" | "minor";
export const VALID_IMPACTS: TicketImpact[] = ["blocks_me", "slows_me_down", "minor"];

/** "Still broken" is offered for this long after resolving; then the ticket closes on its own (page 11) */
export const REOPEN_WINDOW_DAYS = 5;
const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// TRANSITIONS (page 4, page 11 S2): from -> [{ to, who }]. The server enforces exactly these arrows;
// anything else is HTTP 409. The right arrow by the wrong person is HTTP 403.
// ---------------------------------------------------------------------------------------------

/**
 * Who may take an arrow, worked out per (user, ticket):
 *   requester - the employee who raised the ticket
 *   assignee  - the ticket's owner (ticket.assignee_id)
 *   lead      - a Department Lead of the ticket's department
 *   agent     - any Agent or Lead of the ticket's department (ticketAccess.canWork)
 *   system    - the server itself, no user (auto-close after REOPEN_WINDOW_DAYS)
 */
export type TransitionWho = "requester" | "assignee" | "lead" | "agent" | "system";

export interface TransitionRule {
  to: TicketStatus;
  who: TransitionWho[];
  /** How the arrow is taken in the API / UI, for people reading this map */
  via?: string;
}

export const TRANSITIONS: Record<TicketStatus, TransitionRule[]> = {
  "Pending approval": [
    { to: "New", who: ["lead"], via: "lead approves (S6, Sprint 2)" },
    { to: "Cancelled", who: ["lead", "requester"], via: "lead rejects with a reason / employee withdraws" },
  ],
  New: [
    { to: "Open", who: ["agent"], via: "POST /claim (agent) or PATCH /assign (lead): sets the owner in the same transaction" },
    { to: "Cancelled", who: ["requester"], via: "employee withdraws" },
  ],
  Open: [
    { to: "Waiting on employee", who: ["assignee", "lead"], via: "asks a question" },
    { to: "Resolved", who: ["assignee", "lead"], via: "resolve with a resolution note (required)" },
  ],
  "Waiting on employee": [
    { to: "Open", who: ["requester", "assignee", "lead"], via: "the requester's public reply moves it back automatically" },
  ],
  Resolved: [
    { to: "Closed", who: ["requester", "system"], via: "Yes, it's fixed / REOPEN_WINDOW_DAYS pass" },
    { to: "Open", who: ["requester"], via: "Still broken within REOPEN_WINDOW_DAYS: reopen_count + 1, 'reopened' event" },
  ],
  Closed: [],
  Cancelled: [],
};

/** The ticket fields the transition rules need */
export interface TransitionTicket extends TicketAccessTicket {
  ticket_status: TicketStatus;
  assignee_id: string | number | null;
  resolved_at?: Date | string | null;
}

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | { ok: false; status: 403 | 409; message: string };

const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/** Every "who" this user is for this ticket. `null` user = the system. */
export const transitionRolesOf = (user: TicketAccessUser | null, ticket: TransitionTicket): Set<TransitionWho> => {
  const roles = new Set<TransitionWho>();
  if (user === null) {
    roles.add("system");
    return roles;
  }
  if (isRequester(user, ticket)) roles.add("requester");
  if (canWork(user, ticket)) {
    roles.add("agent");
    if (isDepartmentLead(user, ticket)) roles.add("lead");
    if (sameId(ticket.assignee_id, user.user_id)) roles.add("assignee");
  }
  return roles;
};

const withinReopenWindow = (ticket: TransitionTicket, now: Date): boolean => {
  if (!ticket.resolved_at) return false;
  return now.getTime() - new Date(ticket.resolved_at).getTime() <= REOPEN_WINDOW_MS;
};

/**
 * May `user` move `ticket` to `to` right now? Returns the HTTP status and a readable message when
 * not: 409 for an arrow that doesn't exist (or a closed time window), 403 for the wrong person.
 * `user` must come from loadTicketAccess() so a lead's departments are known; null = the system.
 * Claim/assign (New -> Open) also need their own checks (agents only claim for themselves, etc.).
 */
export const checkTransition = (
  user: TicketAccessUser | null,
  ticket: TransitionTicket,
  to: TicketStatus,
  now: Date = new Date()
): TransitionCheck => {
  const from = ticket.ticket_status;
  if (from === to) {
    return { ok: false, status: 409, message: `This ticket is already ${to}.` };
  }
  const rule = TRANSITIONS[from]?.find((r) => r.to === to);
  if (!rule) {
    if (FINAL_STATUSES.includes(from)) {
      return { ok: false, status: 409, message: `This ticket is ${from}, so it can't change any more.` };
    }
    return { ok: false, status: 409, message: `A ticket can't move from ${from} to ${to}.` };
  }

  // Resolved has a 5-day window: the requester may reopen inside it, the system closes after it
  if (from === "Resolved" && to === "Open" && !withinReopenWindow(ticket, now)) {
    return {
      ok: false,
      status: 409,
      message: `The ${REOPEN_WINDOW_DAYS} days to say "Still broken" have passed. Please raise a new request.`,
    };
  }
  if (from === "Resolved" && to === "Closed" && user === null && withinReopenWindow(ticket, now)) {
    return { ok: false, status: 409, message: `Resolved tickets close on their own after ${REOPEN_WINDOW_DAYS} days.` };
  }

  const roles = transitionRolesOf(user, ticket);
  if (!rule.who.some((who) => roles.has(who))) {
    return {
      ok: false,
      status: 403,
      message:
        from === "Open" || from === "Waiting on employee"
          ? "Only the ticket's owner or the department lead can change this ticket."
          : `You can't move this ticket from ${from} to ${to}.`,
    };
  }
  return { ok: true, rule };
};

/** Boolean form of checkTransition() */
export const canTransition = (
  user: TicketAccessUser | null,
  ticket: TransitionTicket,
  to: TicketStatus,
  now: Date = new Date()
): boolean => checkTransition(user, ticket, to, now).ok;

/** Every status this user may move the ticket to right now (for GET /api/tickets/:id/actions) */
export const allowedTransitions = (
  user: TicketAccessUser | null,
  ticket: TransitionTicket,
  now: Date = new Date()
): TicketStatus[] => TRANSITIONS[ticket.ticket_status].map((r) => r.to).filter((to) => canTransition(user, ticket, to, now));

// ---------------------------------------------------------------------------------------------
// Rows and DTOs
// ---------------------------------------------------------------------------------------------

/** slaState() in services/sla.ts */
export type SlaState = "met" | "breached" | "due_soon" | "on_track";

export interface Ticket {
  ticket_id: number;
  title: string;
  description: string | null;
  ticket_department_id: number;
  ticket_category_id: number;
  ticket_priority: TicketPriority;
  ticket_status: TicketStatus;
  impact: TicketImpact | null;
  extra_fields: Record<string, unknown>;
  requester_id: string;
  assignee_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  reopen_count: number;
  resolution_note: string | null;
  first_response_due_at: Date | null;
  resolution_due_at: Date | null;
  first_response_at: Date | null;
  // Joined / computed
  department_name?: string | null;
  category_name?: string | null;
  category_icon?: string | null;
  category_kind?: "fix" | "request" | null;
  requester_name?: string | null;
  requester_email?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  sla_state?: SlaState;
}

export interface TicketComment {
  comment_id: number;
  ticket_id: number;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: Date;
  updated_at?: Date;
  edited_at?: Date | null;
  deleted_at?: Date | null;
  author_name?: string;
  author_email?: string;
  author_role?: string;
}

/** Types written to ticket_event (page 13). The CHECK in 001_lifecycle.sql lists the same. */
export type TicketEventType =
  | "created"
  | "claimed"
  | "assigned"
  | "status_changed"
  | "priority_changed"
  | "approved"
  | "rejected"
  | "reopened"
  | "comment_deleted"
  | "comment_edited"
  | "feedback_given"
  // Sprint 2 (db/migrations/003_sprint2.sql)
  | "department_changed"
  | "attached";

export interface TicketEvent {
  event_id: string; // bigserial comes back from pg as a string
  ticket_id: number;
  actor_id: string | null;
  type: TicketEventType;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  is_internal: boolean;
  created_at: Date;
  actor_name?: string | null;
}

export interface TicketFeedback {
  feedback_id: number;
  ticket_id: number;
  user_id: string;
  rating: number;
  comment?: string | null;
  created_at: Date;
  updated_at?: Date;
  user_name?: string;
  user_email?: string;
}

export interface TicketDetail extends Ticket {
  comments?: TicketComment[];
  feedback?: TicketFeedback | null;
}


export interface TicketFilters {
  status?: string | null;
  priority?: string | null;
  department_id?: number | null;
  creator_id?: string | null;
  assignee_id?: string | null;
  search?: string | null;
  page: number;
  limit: number;
  include_deleted?: boolean;
}

export interface PaginatedTicketsResult {
  tickets: Ticket[];
  total: number;
}
