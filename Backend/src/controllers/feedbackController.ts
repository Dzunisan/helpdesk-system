// S10 CSAT survey (briefing p.19). Contract: docs/api-sprint-2.md "S10". The rules live in
// services/feedbackService.ts. Routes: routes/feedbackRoutes.ts (GET/POST /api/tickets/:id/feedback)
// and routes/csatRoutes.ts (GET /api/reports/csat).
import { Request, Response } from "express";
import * as feedbackService from "../services/feedbackService";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

const LABEL = "Feedback error";

/** GET /api/tickets/:id/feedback -> { feedback: TicketFeedback | null } */
export const getFeedback = async (req: Request, res: Response) => {
  try {
    const feedback = await feedbackService.getFeedback(parseIntId(req.params.id), req.user!);
    return res.status(200).json({ feedback });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

/** POST /api/tickets/:id/feedback { rating, tags?, comment? } -> 201 { message, feedback } */
export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const feedback = await feedbackService.submitFeedback(parseIntId(req.params.id), req.user!, req.body);
    return res.status(201).json({ message: "Thanks for the feedback.", feedback });
  } catch (error) {
    return sendError(res, error, LABEL);
  }
};

const one = (value: unknown): string => String(Array.isArray(value) ? value[0] : (value ?? "")).trim();

/** GET /api/reports/csat?days=30 (Lead: own department forced; System Admin: ?department_id= or all) */
export const csatReport = async (req: Request, res: Response) => {
  try {
    const daysText = one(req.query.days);
    let days = feedbackService.DEFAULT_DAYS;
    if (daysText) {
      if (!/^\d{1,4}$/.test(daysText) || Number(daysText) < 1 || Number(daysText) > feedbackService.MAX_DAYS) {
        throw new HttpError(400, `days must be a whole number from 1 to ${feedbackService.MAX_DAYS}.`);
      }
      days = Number(daysText);
    }
    const departmentText = one(req.query.department_id);
    const departmentId = departmentText ? parseIntId(departmentText, "department") : null;
    const report = await feedbackService.csatReport(req.user!, { days, departmentId });
    return res.status(200).json(report);
  } catch (error) {
    return sendError(res, error, "CSAT report error");
  }
};
