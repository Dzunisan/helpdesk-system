import { Request, Response } from "express";
import * as ticketService from "../services/ticketService";
import {
  canListTickets,
  departmentsOf,
  loadTicketAccess,
  STAFF_ROLES
} from "../services/ticketAccess";
import {
  TicketStatus,
  VALID_PRIORITIES,
  VALID_STATUSES
} from "../types/ticket.types";
import * as lifecycle from "../services/ticketLifecycle";
import * as timeline from "../services/ticketTimeline";
import { closeExpiredResolved } from "../services/ticketLifecycle";
import { runJobsSoon } from "../services/jobs";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

// Helper for normalizing status strings case-insensitively
const normalizeStatus = (val?: string): TicketStatus | null => {
  if (!val) return null;
  const match = VALID_STATUSES.find(s => s.toLowerCase() === val.trim().toLowerCase());
  return match || null;
};

// Ids of int columns (ticket, department, category, request type, comment): digits only and
// within Postgres' integer range, so a huge number is a 400 instead of a database error
const MAX_INT_ID = 2147483647;
const isIntId = (val: unknown): boolean => {
  const text = String(val ?? "").trim();
  return /^\d+$/.test(text) && Number(text) <= MAX_INT_ID;
};

// User ids are bigint: up to 18 digits always fits
const isUserId = (val: unknown): boolean => /^\d{1,18}$/.test(String(val ?? "").trim());

const handleError = (res: Response, error: any) => {
  console.error("Ticket error:", error);
  if (error.code === "23503") {
    return res.status(400).json({ message: "Referenced entity (department, category, or user) does not exist." });
  }
  // The database error text stays in the server log; the browser only gets a generic message
  return res.status(500).json({ message: "An unexpected error occurred" });
};


// ---------------------------------------------------------------------------------------------
// Reading tickets (S1 scope; S2 status lists + assignee me/none; S3 sort=due + sla filters)
// ---------------------------------------------------------------------------------------------

const LIST_SORTS = ["due", "created", "updated"] as const;
const LIST_SLA = ["breached", "due_soon"] as const;

const queryText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return "";
};

/** "Open,Waiting on employee" -> each value checked against `allowed` (case-insensitive) */
const parseList = <T extends string>(raw: string, allowed: readonly T[], label: string): T[] => {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return values.map((value) => {
    const match = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
    if (!match) throw new HttpError(400, `Unknown ${label} "${value}". Allowed values: ${allowed.join(", ")}.`);
    return match;
  });
};

export const fetchTickets = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    // ticketAccess: System Admin (counts only) and Platform Admin (none) can't list ticket content
    const access = await loadTicketAccess(user);
    if (!canListTickets(access)) {
      return res.status(403).json({ message: "Forbidden: Your role does not have access to tickets." });
    }

    const q = req.query;
    const page = Math.max(parseInt(queryText(q.page), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(queryText(q.limit), 10) || 10, 1), 100);

    const statusRaw = queryText(q.status);
    const statuses = statusRaw ? parseList(statusRaw, VALID_STATUSES, "status") : [];
    const priorityRaw = queryText(q.priority);
    const priorities = priorityRaw ? parseList(priorityRaw, VALID_PRIORITIES, "priority") : [];

    const sortRaw = queryText(q.sort);
    const sort = sortRaw ? parseList(sortRaw, LIST_SORTS, "sort")[0] : "created";
    const slaRaw = queryText(q.sla);
    const sla = slaRaw ? parseList(slaRaw, LIST_SLA, "sla")[0] : null;
    // "Breached" and "due soon" are about work still owed: without a status list they mean the
    // live statuses, so a ticket closed late long ago never shows as overdue (send status to widen)
    if (sla && statuses.length === 0) statuses.push("New", "Open", "Waiting on employee");

    const deptRaw = queryText(q.department_id ?? q.department);
    if (deptRaw && !isIntId(deptRaw)) throw new HttpError(400, "department_id must be a valid integer.");
    const categoryRaw = queryText(q.category_id);
    if (categoryRaw && !isIntId(categoryRaw)) throw new HttpError(400, "category_id must be a valid integer.");

    const creatorRaw = queryText(q.creator_id ?? q.requester_id ?? q.creator);
    if (creatorRaw && !isUserId(creatorRaw)) throw new HttpError(400, "creator_id must be a valid user ID.");

    // assignee_id: a user id, "me" (the caller) or "none" (unassigned)
    let assigneeId: string | null = queryText(q.assignee_id ?? q.assignee) || null;
    if (assigneeId?.toLowerCase() === "me") assigneeId = String(user.user_id);
    else if (assigneeId?.toLowerCase() === "none") assigneeId = "none";
    else if (assigneeId && !isUserId(assigneeId)) {
      throw new HttpError(400, 'assignee_id must be a user ID, "me" or "none".');
    }

    const filters: ticketService.TicketListFilters = {
      page,
      limit,
      statuses,
      priorities,
      // Agents and Leads get their department from the role (ticketAccess); the browser's
      // department_id is ignored for them so it can never widen the scope
      department_id: STAFF_ROLES.includes(user.role) || !deptRaw ? null : Number(deptRaw),
      creator_id: creatorRaw || null,
      assignee_id: assigneeId,
      category_id: categoryRaw ? Number(categoryRaw) : null,
      search: queryText(q.search) || null,
      sort,
      sla,
    };

    // Resolved tickets past the 5-day window close on read (S2)
    await closeExpiredResolved();
    // S9: breach alerts and queued emails ride along on queue loads (at most once a minute)
    runJobsSoon();
    const { tickets, total } = await ticketService.getTickets(filters, access);
    return res.status(200).json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return error instanceof HttpError ? sendError(res, error) : handleError(res, error);
  }
};

export const getTicketById = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const ticketId = parseIntId(req.params.id);
    await closeExpiredResolved(ticketId);

    // ticketAccess: not found and not allowed look the same (404), so we never admit the ticket exists
    const resolved = await ticketService.resolveTicketAccess(ticketId, user);
    if (!resolved) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    const ticket = await ticketService.getTicketById(ticketId, resolved.canWork, false);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    return error instanceof HttpError ? sendError(res, error) : handleError(res, error);
  }
};

// ---------------------------------------------------------------------------------------------
// S2 ownership and status (services/ticketLifecycle.ts)
// ---------------------------------------------------------------------------------------------

/** PATCH /api/tickets/:id/assign { assignee_id, note? } */
export const assignTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticketId = parseIntId(req.params.id);
    const raw = req.body?.assignee_id ?? req.body?.assigneeId;
    const assigneeId = raw === undefined || raw === null || String(raw).trim() === "" ? null : String(raw).trim();
    if (assigneeId !== null && !isUserId(assigneeId)) {
      throw new HttpError(400, "Assignee ID must be a valid user ID.");
    }
    const ticket = await lifecycle.assignTicket(ticketId, user, assigneeId, req.body?.note);
    return res.status(200).json({ message: "Ticket assigned.", ticket });
  } catch (error) {
    return sendError(res, error);
  }
};

/**
 * PATCH /api/tickets/:id/status { status, note? } (older screens): no longer a free path. It is
 * POST /:id/transition under another name, with the same arrows, people and events.
 */
export const updateStatus = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticketId = parseIntId(req.params.id);
    const to = normalizeStatus(String(req.body?.status ?? req.body?.to ?? ""));
    if (!to) throw new HttpError(400, `Status must be one of: ${VALID_STATUSES.join(", ")}.`);
    const ticket = await lifecycle.transitionTicket(ticketId, user, to, req.body?.note);
    return res.status(200).json({ message: `Ticket moved to ${to}.`, ticket });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/tickets/:id/approve { note? } (S6 in Sprint 2; kept working with its event) */
export const approveTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticket = await lifecycle.approveTicket(parseIntId(req.params.id), user, req.body?.note);
    return res.status(200).json({ message: "Request approved.", ticket });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/tickets/:id/reject { reason } (S6 in Sprint 2; kept working with its event) */
export const rejectTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticket = await lifecycle.rejectTicket(parseIntId(req.params.id), user, req.body?.reason);
    return res.status(200).json({ message: "Request rejected.", ticket });
  } catch (error) {
    return sendError(res, error);
  }
};

// ---------------------------------------------------------------------------------------------
// S4 comments (services/ticketTimeline.ts)
// ---------------------------------------------------------------------------------------------

/**
 * POST /api/tickets/:id/comments { body, is_internal?, attachment_ids?, macro_id?, set_status? }
 * -> 201 { comment, set_status } (docs/api-sprint-2.md: the Sprint 2 extras)
 */
export const addComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticketId = parseIntId(req.params.ticket_id ?? req.params.id);
    const body = req.body?.body !== undefined ? req.body.body : req.body?.comment;
    const flag = req.body?.is_internal ?? req.body?.internal_note ?? false;
    if (typeof flag !== "boolean") throw new HttpError(400, "is_internal must be true or false.");

    // S14: ids from POST /api/tickets/:id/attachments
    const rawAttachments = req.body?.attachment_ids;
    let attachmentIds: number[] = [];
    if (rawAttachments !== undefined && rawAttachments !== null) {
      if (!Array.isArray(rawAttachments) || !rawAttachments.every(isIntId)) {
        throw new HttpError(400, "attachment_ids must be a list of attachment IDs.");
      }
      attachmentIds = rawAttachments.map(Number);
    }
    // S7: the macro that was inserted (use_count, default "then set status")
    const rawMacro = req.body?.macro_id;
    let macroId: number | null = null;
    if (rawMacro !== undefined && rawMacro !== null && rawMacro !== "") {
      if (!isIntId(rawMacro)) throw new HttpError(400, "macro_id must be a valid integer.");
      macroId = Number(rawMacro);
    }
    // set_status: omitted = the macro's; null = reply only; a status = that move if allowed
    const rawStatus = req.body?.set_status;
    let setStatus: TicketStatus | null | undefined = undefined;
    if (rawStatus === null || rawStatus === "") setStatus = null;
    else if (rawStatus !== undefined) {
      setStatus = normalizeStatus(String(rawStatus));
      if (!setStatus) throw new HttpError(400, `set_status must be one of: ${VALID_STATUSES.join(", ")}.`);
    }

    const comment = await timeline.addComment(ticketId, user, body, flag, { attachmentIds, macroId, setStatus });
    const { set_status, ...rest } = comment;
    return res
      .status(201)
      .json({ message: flag ? "Internal note added." : "Reply sent.", comment: rest, set_status });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/tickets/:id/comments (older screens; the timeline is the S4 read) */
export const getComments = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const comments = await timeline.listComments(parseIntId(req.params.ticket_id ?? req.params.id), user);
    return res.status(200).json({ comments });
  } catch (error) {
    return sendError(res, error);
  }
};

/** PATCH /api/comments/:id { body }: the author, within 15 minutes */
export const editComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const commentId = parseIntId(req.params.id, "comment");
    const body = req.body?.body !== undefined ? req.body.body : req.body?.comment;
    const comment = await timeline.editComment(commentId, user, body);
    return res.status(200).json({ message: "Message edited.", comment });
  } catch (error) {
    return sendError(res, error);
  }
};

/** DELETE /api/comments/:id: soft delete, leaves "Message removed by <name>" */
export const deleteComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const comment = await timeline.deleteComment(parseIntId(req.params.id, "comment"), user);
    return res.status(200).json({ message: "Message removed.", comment });
  } catch (error) {
    return sendError(res, error);
  }
};

// ---------------------------------------------------------------------------------------------
// Feedback (S10 in Sprint 2) and the agent picker
// ---------------------------------------------------------------------------------------------

// POST /api/tickets/:ticket_id/feedback
export const submitFeedback = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.ticket_id || req.params.id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());
  const { rating, comment, feedback } = req.body;

  if (rating === undefined || rating === null) {
    return res.status(400).json({ message: "Rating is required." });
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: "Rating must be an integer between 1 and 5." });
  }

  const feedbackComment = comment !== undefined ? comment : feedback;

  try {
    const result = await ticketService.submitTicketFeedback(ticketId, user, ratingNum, feedbackComment);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      feedback: result.feedback
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /api/tickets/:ticket_id/feedback
export const getFeedback = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.ticket_id || req.params.id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());

  try {
    const result = await ticketService.getTicketFeedback(ticketId, user);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      feedback: result.feedback
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /api/tickets/agents
export const getAgents = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Only Agents and Department Leads pick assignees; everyone else gets no staff directory
  if (!STAFF_ROLES.includes(user.role)) {
    return res.status(403).json({ message: "Forbidden: Only agents and leads can list agents." });
  }

  try {
    // The server decides the departments (ticketAccess): the caller's own. department_id may only
    // narrow that list (a lead of several departments), never widen it.
    const access = await loadTicketAccess(user);
    let departmentIds = departmentsOf(access);
    const deptParam = req.query.department_id as string;
    if (deptParam && isIntId(deptParam)) {
      departmentIds = departmentIds.filter((id) => id === Number(deptParam.trim()));
    }

    const agents = await ticketService.getAvailableAgents(departmentIds);
    return res.status(200).json({ agents });
  } catch (error) {
    return handleError(res, error);
  }
};
