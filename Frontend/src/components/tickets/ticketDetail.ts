import type { Role } from "@/context/AuthContext";
import type { Ticket, TicketComment } from "@/types/ticket.types";
import { toStatus, type Status } from "@/lib/ticketVocabulary";

/** The roles the ticket page cares about; System and Platform Admins never reach a ticket */
export type ViewerRole = "Employee" | "Agent" | "Department Lead";

/** Accepts the stored role in any legacy spelling ("support_agent", "lead"...) */
export function normalizeRole(raw: unknown): ViewerRole | "Admin" {
  const r = String(raw ?? "").trim().toLowerCase();
  if (["department lead", "department_lead", "lead"].includes(r)) return "Department Lead";
  if (["agent", "support agent", "support_agent"].includes(r)) return "Agent";
  if (["system admin", "system_admin", "sysadmin", "platform admin", "platform_admin", "admin"].includes(r)) return "Admin";
  return "Employee";
}

/** What the signed-in user may do on this ticket (the server enforces the same rules) */
export interface TicketPermissions {
  role: ViewerRole | "Admin";
  userId: string;
  isStaff: boolean;
  isLead: boolean;
  isRequester: boolean;
  canSeeInternal: boolean;
  canAddInternal: boolean;
  canChangeStatus: boolean;
  canApproveReject: boolean;
  canReassign: boolean;
}

export function permissionsFor(user: { role?: Role | string | null; user_id?: string; id?: string } | null, ticket?: Ticket | null): TicketPermissions {
  const role = normalizeRole(user?.role);
  const userId = String(user?.user_id ?? user?.id ?? "");
  const isAgent = role === "Agent";
  const isLead = role === "Department Lead";
  const isStaff = isAgent || isLead;
  return {
    role,
    userId,
    isStaff,
    isLead,
    isRequester: !!ticket && String(ticket.requester_id) === userId,
    canSeeInternal: role !== "Employee",
    canAddInternal: isStaff,
    canChangeStatus: isStaff,
    canApproveReject: isLead,
    canReassign: isLead,
  };
}

/** The display status ("new", "open", "pending"...) of a stored ticket status */
export const displayStatus = (ticket: Pick<Ticket, "ticket_status">): Status => toStatus(ticket.ticket_status);

export const firstName = (name: string | null | undefined, fallback = "them") => name?.trim().split(/\s+/)[0] || fallback;

/** Comments the server writes on approve / reject, shown as timeline events instead of messages */
export type SystemEvent = { kind: "approved" | "rejected"; note: string | null };

export function systemEventOf(comment: Pick<TicketComment, "body">): SystemEvent | null {
  const body = comment.body.trim();
  const approvedNote = /^Request approved:\s*([\s\S]+)$/i.exec(body);
  if (approvedNote) return { kind: "approved", note: approvedNote[1].trim() };
  if (/^Request approved by .+$/i.test(body)) return { kind: "approved", note: null };
  const rejected = /^Request rejected:\s*([\s\S]+)$/i.exec(body);
  if (rejected) return { kind: "rejected", note: rejected[1].trim() };
  return null;
}

/** "Agent", "Lead", "Admin" for the role shown next to a staff author's name */
export function roleWord(role: string | null | undefined): string {
  const r = normalizeRole(role);
  if (r === "Department Lead") return "Lead";
  if (r === "Agent") return "Agent";
  if (r === "Admin") return "Admin";
  return "Employee";
}

/** Comments can be edited or deleted by their author for 15 minutes */
export const EDIT_WINDOW_MINUTES = 15;

export function canModifyComment(comment: TicketComment, userId: string, now = Date.now()): boolean {
  if (String(comment.author_id) !== userId) return false;
  const ageMinutes = (now - new Date(comment.created_at).getTime()) / 60_000;
  return ageMinutes <= EDIT_WINDOW_MINUTES;
}

/** Where "‹ Back" goes: the list this ticket most likely came from */
export function backLinkFor(role: ViewerRole | "Admin", ticket: Ticket | null, userId: string): { to: string; label: string } {
  if (role === "Agent") {
    if (ticket && String(ticket.assignee_id) === userId) return { to: "/agent/queue/my-open", label: "My open" };
    if (ticket && !ticket.assignee_id && displayStatus(ticket) === "new") return { to: "/agent/queue/unassigned", label: "Unassigned" };
    // My open is the agent's inbox, also the way out of a ticket that can't be shown
    return ticket ? { to: "/agent", label: "Home" } : { to: "/agent/queue/my-open", label: "My open" };
  }
  if (role === "Department Lead") {
    if (ticket && displayStatus(ticket) === "pending") return { to: "/department-lead/approvals", label: "Approvals" };
    return { to: "/department-lead/all-tickets", label: "All tickets" };
  }
  return { to: "/employee/my-requests", label: "My requests" };
}
