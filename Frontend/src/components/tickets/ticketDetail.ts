import type { Role } from "@/context/AuthContext";
import type { Ticket } from "@/types/api";

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

/** "Agent", "Lead", "Admin" for the role shown next to a staff author's name */
export function roleWord(role: string | null | undefined): string {
  const r = normalizeRole(role);
  if (r === "Department Lead") return "Lead";
  if (r === "Agent") return "Agent";
  if (r === "Admin") return "Admin";
  return "Employee";
}
