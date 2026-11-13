// Shared shape for the comment extension points (Sprint 2). services/ticketTimeline.ts addComment()
// builds one CommentContext inside its transaction and hands it to:
//   extensions/commentMacro.ts       (S7 macros:      macro_id     -> use_count, default set_status)
//   extensions/commentAttachments.ts (S14 attachments: attachment_ids -> link files to the comment)
// The feature owners edit THOSE files, never the core comment code. Contract: docs/api-sprint-2.md.
import type { PoolClient } from "pg";
import type { TicketAccessUser } from "../ticketAccess";
import type { TicketStatus } from "../../types/ticket.types";
import type { User } from "../../types/user.types";

export interface CommentContext {
  /** The comment's transaction: everything written here commits or rolls back with the comment */
  client: PoolClient;
  user: User;
  access: TicketAccessUser;
  ticket: {
    ticket_id: number;
    title: string;
    requester_id: string;
    assignee_id: string | null;
    ticket_department_id: number;
    ticket_status: TicketStatus;
  };
  /** Agent or lead of the ticket's department (ticketAccess.canWork) */
  staff: boolean;
  /** The caller raised the ticket */
  requester: boolean;
  /** The comment being written is an internal note */
  isInternal: boolean;
}
