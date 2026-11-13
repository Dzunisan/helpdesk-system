// S4 Conversation & activity timeline (briefing p.13). Contract: docs/api-sprint-1.md "S4".
import { Request, Response } from "express";
import { closeExpiredResolved } from "../services/ticketLifecycle";
import * as timeline from "../services/ticketTimeline";
import { parseIntId, sendError } from "../utils/httpError";

/** GET /api/tickets/:id/timeline -> events + comments merged by time, filtered by role on the server */
export const getTimeline = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticketId = parseIntId(req.params.id);
    await closeExpiredResolved(ticketId);
    const items = await timeline.getTimeline(ticketId, user);
    return res.status(200).json({ items });
  } catch (error) {
    return sendError(res, error, "Timeline error");
  }
};
