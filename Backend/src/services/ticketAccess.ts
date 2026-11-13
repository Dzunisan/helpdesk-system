// One module with the ticket visibility rules (briefing S1, "Department workspaces & privacy").
// The server decides who sees what, never the browser:
//   Employee        -> only tickets they raised
//   Agent           -> tickets in their own department (plus any they raised themselves)
//   Department Lead -> tickets in the department(s) they lead or belong to (plus their own)
//   System Admin    -> counts only, never ticket content
//   Platform Admin  -> no ticket access at all
// A ticket the user may not view must be answered with 404 "Ticket not found." so we never
// admit that it exists.
import { query } from "../config/database";
import { User } from "../types/user.types";

export const STAFF_ROLES = ["Agent", "Department Lead"];
export const NO_TICKET_ACCESS_ROLES = ["System Admin", "Platform Admin"];

export const TICKET_NOT_FOUND = "Ticket not found.";

// The user fields the rules need. department_ids covers a lead who leads a department that
// differs from users.department_id; use loadTicketAccess() to fill it in.
export interface TicketAccessUser {
  user_id: string | number;
  role: string;
  department_id?: number | null;
  department_ids?: number[];
}

// The ticket fields the rules need.
export interface TicketAccessTicket {
  requester_id: string | number | null;
  ticket_department_id: number | null;
}

const sameId = (a: unknown, b: unknown) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

const departmentsOf = (user: TicketAccessUser): number[] => {
  const ids = new Set<number>();
  if (user.department_id !== null && user.department_id !== undefined) ids.add(Number(user.department_id));
  for (const id of user.department_ids ?? []) ids.add(Number(id));
  return [...ids];
};

// Adds the departments a Department Lead leads (department.lead_id) to the user. Call once per
// request before canView / canWork / ticketScopeCondition.
export const loadTicketAccess = async (user: User | TicketAccessUser): Promise<TicketAccessUser> => {
  const access: TicketAccessUser = {
    user_id: user.user_id,
    role: user.role,
    department_id: user.department_id ?? null,
    department_ids: (user as TicketAccessUser).department_ids,
  };
  if (user.role === "Department Lead") {
    const { rows } = await query("SELECT department_id FROM department WHERE lead_id = $1", [user.user_id]);
    access.department_ids = [...new Set([...(access.department_ids ?? []), ...rows.map((r) => Number(r.department_id))])];
  }
  return access;
};

export const isRequester = (user: TicketAccessUser, ticket: TicketAccessTicket): boolean =>
  sameId(ticket.requester_id, user.user_id);

// May this user list tickets at all? System Admin and Platform Admin may not.
export const canListTickets = (user: TicketAccessUser): boolean =>
  user.role === "Employee" || STAFF_ROLES.includes(user.role);

// Staff of the ticket's department: may claim, assign, change status, approve (leads), read and
// write internal notes.
export const canWork = (user: TicketAccessUser, ticket: TicketAccessTicket): boolean => {
  if (!STAFF_ROLES.includes(user.role)) return false;
  if (ticket.ticket_department_id === null || ticket.ticket_department_id === undefined) return false;
  return departmentsOf(user).includes(Number(ticket.ticket_department_id));
};

// May this user see the ticket at all? Requesters see their own; staff see their department's.
export const canView = (user: TicketAccessUser, ticket: TicketAccessTicket): boolean => {
  if (NO_TICKET_ACCESS_ROLES.includes(user.role)) return false;
  if (isRequester(user, ticket)) return true;
  return canWork(user, ticket);
};

// SQL condition limiting a list query to the tickets this user may view. Parameters are
// numbered from startIndex. Returns null when the role may not list tickets at all.
// The department comes from the role: callers must ignore any department_id the browser sends
// for Agents and Leads.
export const ticketScopeCondition = (
  user: TicketAccessUser,
  startIndex: number,
  alias = "t"
): { sql: string; values: any[] } | null => {
  if (user.role === "Employee") {
    return { sql: `${alias}.requester_id = $${startIndex}`, values: [String(user.user_id)] };
  }
  if (STAFF_ROLES.includes(user.role)) {
    return {
      sql: `(${alias}.ticket_department_id = ANY($${startIndex}::int[]) OR ${alias}.requester_id = $${startIndex + 1})`,
      values: [departmentsOf(user), String(user.user_id)],
    };
  }
  return null;
};
