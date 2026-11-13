// S6 Approvals (briefing p.15). Contract: docs/api-sprint-2.md "S6". The routes are Department Lead
// only (routes/approvalRoutes.ts); the department always comes from department.lead_id, never from
// the browser. Approve / reject are POST /api/tickets/:id/approve | reject (services/ticketLifecycle.ts).
import { Request, Response } from "express";
import { loadTicketAccess } from "../services/ticketAccess";
import { countPendingApprovals, listMyDecisions, listPendingApprovals } from "../services/approvalService";
import { HttpError, sendError } from "../utils/httpError";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const queryText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return "";
};

/** page / limit from the query: positive integers, limit at most 100 (400 otherwise) */
const pageParams = (q: Request["query"]) => {
  const pageRaw = queryText(q.page);
  const limitRaw = queryText(q.limit);
  if (pageRaw && !/^\d{1,6}$/.test(pageRaw)) throw new HttpError(400, "page must be a positive whole number.");
  if (limitRaw && !/^\d{1,4}$/.test(limitRaw)) throw new HttpError(400, "limit must be a positive whole number.");
  const page = pageRaw ? Number(pageRaw) : 1;
  const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;
  if (page < 1) throw new HttpError(400, "page must be a positive whole number.");
  if (limit < 1 || limit > MAX_LIMIT) throw new HttpError(400, `limit must be between 1 and ${MAX_LIMIT}.`);
  return { page, limit };
};

/** GET /api/approvals?status=pending | ?decided_by=me (Department Lead: own led department only) */
export const listApprovals = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const status = queryText(req.query.status).toLowerCase();
    const decidedBy = queryText(req.query.decided_by).toLowerCase();
    if (status && status !== "pending") throw new HttpError(400, 'status must be "pending".');
    if (decidedBy && decidedBy !== "me") throw new HttpError(400, 'decided_by must be "me".');
    if (status && decidedBy) throw new HttpError(400, "Use either status=pending or decided_by=me, not both.");
    const { page, limit } = pageParams(req.query);

    const access = await loadTicketAccess(user);
    const { approvals, total } = decidedBy
      ? await listMyDecisions(access, page, limit)
      : await listPendingApprovals(access, page, limit);
    return res.status(200).json({
      approvals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return sendError(res, error, "Approvals error");
  }
};

/** GET /api/approvals/count -> { pending } for the sidebar badge */
export const countApprovals = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const access = await loadTicketAccess(user);
    return res.status(200).json({ pending: await countPendingApprovals(access) });
  } catch (error) {
    return sendError(res, error, "Approvals error");
  }
};
