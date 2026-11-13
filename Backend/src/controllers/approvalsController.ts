// S6 Approvals (briefing p.15). OWNER: the approvals feature. Contract: docs/api-sprint-2.md "S6".
// Approve / reject already live in services/ticketLifecycle.ts (approveTicket / rejectTicket): they
// write the ticket_approval row, the public event and the approval_decided notification.
import { notImplemented } from "../utils/notImplemented";

/** GET /api/approvals?status=pending | ?decided_by=me (Department Lead: own department only) */
export const listApprovals = notImplemented("S6 GET /api/approvals");

/** GET /api/approvals/count -> { pending } for the sidebar badge */
export const countApprovals = notImplemented("S6 GET /api/approvals/count");
