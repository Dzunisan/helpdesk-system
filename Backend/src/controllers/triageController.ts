// S3 Priority triage (briefing p.12). Contract: docs/api-sprint-1.md "S3".
// Maths: computeDueTimes() / slaState() / SQL_NEXT_DUE / SQL_IS_BREACHED in src/services/sla.ts.
import { Request, Response } from "express";
import * as lifecycle from "../services/ticketLifecycle";
import { VALID_PRIORITIES } from "../types/ticket.types";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

/** PATCH /api/tickets/:id/priority { priority } -> staff only; recompute both due times from created_at; "priority_changed" event */
export const changePriority = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticketId = parseIntId(req.params.id);
    const raw = typeof req.body?.priority === "string" ? req.body.priority.trim() : "";
    const priority = VALID_PRIORITIES.find((p) => p.toLowerCase() === raw.toLowerCase());
    if (!priority) {
      throw new HttpError(400, raw ? `Unknown priority "${raw}".` : "Choose a priority.", [
        `priority must be one of: ${VALID_PRIORITIES.join(", ")}.`,
      ]);
    }
    const ticket = await lifecycle.changePriority(ticketId, user, priority);
    return res.status(200).json({ ticket });
  } catch (error) {
    return sendError(res, error, "Priority error");
  }
};
