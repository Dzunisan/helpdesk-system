// EXTENSION POINT: S7 macros (briefing p.16). Owned by the macros feature; the core comment code
// (services/ticketTimeline.ts addComment) only calls applyMacro() when POST /api/tickets/:id/comments
// carries a macro_id, BEFORE the comment row is written, inside the comment's transaction.
//
// What it does now (enough for the contract; the macros owner may refine it):
//   - only staff of the ticket's department may use a macro (else 403)
//   - the macro must exist, be active and belong to the ticket's department (else 404 "Macro not found.")
//   - use_count + 1 (one per send)
//   - returns the macro's set_status, which addComment applies through the normal transition rules
//     when the request didn't send its own set_status
// The body is NOT replaced: the browser renders the macro first (GET /api/macros/:id/render), the
// agent may edit it, and the edited text is what gets sent.
import { HttpError } from "../../utils/httpError";
import type { TicketStatus } from "../../types/ticket.types";
import type { CommentContext } from "./commentContext";

export interface AppliedMacro {
  id: number;
  title: string;
  /** "Then set status", or null for reply only */
  set_status: TicketStatus | null;
}

export const applyMacro = async (ctx: CommentContext, macroId: number): Promise<AppliedMacro> => {
  if (!ctx.staff) throw new HttpError(403, "Only agents and leads of this ticket's department can use macros.");
  const { rows } = await ctx.client.query<AppliedMacro>(
    `UPDATE canned_response
     SET use_count = use_count + 1
     WHERE id = $1 AND department_id = $2 AND active
     RETURNING id, title, set_status`,
    [macroId, ctx.ticket.ticket_department_id]
  );
  if (!rows[0]) throw new HttpError(404, "Macro not found.");
  return rows[0];
};
