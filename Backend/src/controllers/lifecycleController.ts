// S2 Ticket lifecycle & ownership (briefing p.11). Contract: docs/api-sprint-1.md "S2".
// Rules: TRANSITIONS / checkTransition() / allowedTransitions() in src/types/ticket.types.ts;
// access: src/services/ticketAccess.ts; the work: src/services/ticketLifecycle.ts.
import { Request, Response } from "express";
import * as lifecycle from "../services/ticketLifecycle";
import { VALID_STATUSES } from "../types/ticket.types";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

/** POST /api/tickets/:id/claim  -> assignee = me, status Open, row lock, "claimed" event */
export const claimTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticket = await lifecycle.claimTicket(parseIntId(req.params.id), user);
    return res.status(200).json({ ticket });
  } catch (error) {
    return sendError(res, error, "Claim error");
  }
};

/** POST /api/tickets/:id/transition { to, note? } -> 409 if the arrow doesn't exist, 403 wrong person */
export const transitionTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticketId = parseIntId(req.params.id);
    const raw = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const to = VALID_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
    if (!to) {
      throw new HttpError(400, raw ? `Unknown status "${raw}".` : "Say which status to move to.", [
        `to must be one of: ${VALID_STATUSES.join(", ")}.`,
      ]);
    }
    const ticket = await lifecycle.transitionTicket(ticketId, user, to, req.body?.note);
    return res.status(200).json({ ticket });
  } catch (error) {
    return sendError(res, error, "Transition error");
  }
};

/** GET /api/tickets/:id/actions -> the buttons this user may see right now */
export const getTicketActions = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const actions = await lifecycle.getTicketActions(parseIntId(req.params.id), user);
    return res.status(200).json(actions);
  } catch (error) {
    return sendError(res, error, "Ticket actions error");
  }
};
