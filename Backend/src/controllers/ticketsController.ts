import { Request, Response } from "express";
import * as ticketService from "../services/ticketService";
import {
  canListTickets,
  departmentsOf,
  loadTicketAccess,
  NO_TICKET_ACCESS_ROLES,
  STAFF_ROLES
} from "../services/ticketAccess";
import {
  TicketImpact,
  TicketPriority,
  TicketStatus,
  VALID_IMPACTS,
  VALID_PRIORITIES,
  VALID_STATUSES,
  CreateTicketDto,
  UpdateTicketDto
} from "../types/ticket.types";
import * as lifecycle from "../services/ticketLifecycle";
import * as timeline from "../services/ticketTimeline";
import { closeExpiredResolved } from "../services/ticketLifecycle";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

// Helper for normalizing status strings case-insensitively
const normalizeStatus = (val?: string): TicketStatus | null => {
  if (!val) return null;
  const match = VALID_STATUSES.find(s => s.toLowerCase() === val.trim().toLowerCase());
  return match || null;
};

// Helper for normalizing priority strings case-insensitively
const normalizePriority = (val?: string): TicketPriority | null => {
  if (!val) return null;
  const match = VALID_PRIORITIES.find(p => p.toLowerCase() === val.trim().toLowerCase());
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


export const createTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // System Admin and Platform Admin have no ticket access (ticketAccess), so they don't raise tickets
  if (NO_TICKET_ACCESS_ROLES.includes(user.role)) {
    return res.status(403).json({ message: "Forbidden: Administrators cannot create tickets." });
  }

  // The category decides department, default priority and status (briefing p.14 S5); the browser
  // can't override them. Employees send title, description, category, impact and extra fields;
  // staff may also set priority and raise a ticket for someone else.
  const isStaff = STAFF_ROLES.includes(user.role);
  const {
    title,
    description,
    category_id,
    ticket_category_id,
    department_id,
    ticket_department_id,
    impact,
    extra_fields
  } = req.body;
  const priority = isStaff ? req.body.priority : undefined;
  const requester_id = isStaff ? req.body.requester_id : undefined;

  const errors: string[] = [];

  // Title validation
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    errors.push("Title is required.");
  } else if (title.trim().length > 255) {
    errors.push("Title must be 255 characters or fewer.");
  }

  // Description validation
  if (description !== undefined && description !== null && typeof description !== "string") {
    errors.push("Description must be a string.");
  }

  // Priority validation (staff only; everyone else gets the category's default priority)
  let staffPriority: TicketPriority | null = null;
  if (priority !== undefined && priority !== null) {
    const norm = normalizePriority(String(priority));
    if (!norm) {
      errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    } else {
      staffPriority = norm;
    }
  }

  // Impact ("How is this affecting you?")
  let parsedImpact: TicketImpact | null = null;
  if (impact !== undefined && impact !== null && impact !== "") {
    if (!VALID_IMPACTS.includes(impact)) {
      errors.push(`Impact must be one of: ${VALID_IMPACTS.join(", ")}.`);
    } else {
      parsedImpact = impact;
    }
  }

  // Extra fields: a plain object of answers keyed by the category's field keys (S5 validates them)
  if (extra_fields !== undefined && extra_fields !== null && (typeof extra_fields !== "object" || Array.isArray(extra_fields))) {
    errors.push("extra_fields must be an object.");
  }

  // Category ID validation
  const targetCatId = category_id !== undefined ? category_id : ticket_category_id;
  let parsedCatId: number | null = null;
  if (targetCatId !== undefined && targetCatId !== null && String(targetCatId).trim() !== "") {
    if (!isIntId(String(targetCatId))) {
      errors.push("Category ID must be a valid integer.");
    } else {
      parsedCatId = Number(targetCatId);
    }
  }

  // Department: only used by the legacy bridge below when no category is sent
  const targetDeptId = department_id !== undefined ? department_id : ticket_department_id;
  let legacyDeptId: number | null = null;
  if (parsedCatId === null && targetDeptId !== undefined && targetDeptId !== null && String(targetDeptId).trim() !== "") {
    if (!isIntId(String(targetDeptId))) {
      errors.push("Department ID must be a valid integer.");
    } else {
      legacyDeptId = Number(targetDeptId);
    }
  }

  if (parsedCatId === null && legacyDeptId === null && errors.length === 0) {
    errors.push("Choose a category.");
  }

  // Requester resolution: Employees can only create tickets as themselves
  let resolvedRequesterId = String(user.user_id);
  if (requester_id !== undefined && requester_id !== null && String(requester_id).trim() !== "") {
    if (!isUserId(String(requester_id))) {
      errors.push("Requester ID must be a valid user ID.");
    } else {
      resolvedRequesterId = String(requester_id).trim();
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    // LEGACY BRIDGE (until S5): a department-only request goes to that department's fallback category
    if (parsedCatId === null && legacyDeptId !== null) {
      parsedCatId = await ticketService.getFallbackCategoryId(legacyDeptId);
      if (parsedCatId === null) {
        return res.status(400).json({ message: "Choose a category." });
      }
    }

    const category = await ticketService.getCategoryRouting(parsedCatId!);
    if (!category) {
      return res.status(400).json({ message: "Category not found with the provided ID." });
    }
    if (!category.active) {
      return res.status(400).json({ message: "This category is no longer offered. Please choose another." });
    }

    if (resolvedRequesterId !== String(user.user_id)) {
      const requesterExists = await ticketService.checkUserExists(resolvedRequesterId);
      if (!requesterExists) {
        return res.status(400).json({ message: "Requester user not found." });
      }
    }

    const newTicketDto: CreateTicketDto = {
      title: title.trim(),
      description: description ? description.trim() : null,
      category_id: category.category_id,
      department_id: category.department_id,
      priority: staffPriority ?? category.default_priority,
      // Purchase and access requests start in Pending approval; everything else starts as New
      status: category.needs_approval ? "Pending approval" : "New",
      impact: parsedImpact,
      extra_fields: extra_fields ?? {},
      requester_id: resolvedRequesterId
    };

    const ticket = await ticketService.createTicket(newTicketDto);
    return res.status(201).json({ message: "Ticket created successfully", ticket });
  } catch (error) {
    return handleError(res, error);
  }
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
// Editing ticket details (title / description; staff: department / category). Status, priority
// and owner have their own endpoints with their own rules and timeline events.
// ---------------------------------------------------------------------------------------------

export const updateTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Support /:id parameter, or id in body for legacy /update endpoint
  const idParam = req.params.id || req.body.ticket_id || req.body.id;
  if (!idParam || !isIntId(String(idParam))) {
    return res.status(400).json({ message: "Invalid or missing ticket ID." });
  }

  const ticketId = Number(idParam);

  try {
    // ticketAccess: 404 for anyone who can't view the ticket
    const resolved = await ticketService.resolveTicketAccess(ticketId, user);
    if (!resolved) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    const {
      title,
      description,
      priority,
      status,
      ticket_status,
      ticket_priority,
      department_id,
      ticket_department_id,
      category_id,
      ticket_category_id,
      assignee_id
    } = req.body;

    // The free status / priority / owner paths are gone (S2, S3): every move goes through the
    // endpoint that enforces its rules and writes the timeline event
    if (status !== undefined || ticket_status !== undefined) {
      return res.status(400).json({ message: "Use POST /api/tickets/:id/transition to change the status." });
    }
    if (priority !== undefined || ticket_priority !== undefined) {
      return res.status(400).json({ message: "Use PATCH /api/tickets/:id/priority to change the priority." });
    }
    if (assignee_id !== undefined) {
      return res.status(400).json({ message: "Use POST /api/tickets/:id/claim or PATCH /api/tickets/:id/assign." });
    }

    const errors: string[] = [];
    const updateData: UpdateTicketDto = {};

    // Anyone who can't work the ticket (the requester) may only edit its title and description
    if (!resolved.canWork) {
      const restrictedFields = [department_id, ticket_department_id, category_id, ticket_category_id];
      if (restrictedFields.some((value) => value !== undefined)) {
        return res.status(403).json({
          message: "Forbidden: You can only edit the title and description of your own tickets."
        });
      }
    }

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        errors.push("Title cannot be empty.");
      } else if (title.trim().length > 255) {
        errors.push("Title must be 255 characters or fewer.");
      } else {
        updateData.title = title.trim();
      }
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        errors.push("Description must be a string.");
      } else {
        updateData.description = description ? description.trim() : null;
      }
    }

    const targetDeptId = department_id !== undefined ? department_id : ticket_department_id;
    if (targetDeptId !== undefined) {
      if (targetDeptId === null || String(targetDeptId).trim() === "") {
        errors.push("A ticket always belongs to a department.");
      } else if (!isIntId(String(targetDeptId))) {
        errors.push("Department ID must be a valid integer.");
      } else {
        const deptIdNum = Number(targetDeptId);
        const exists = await ticketService.checkDepartmentExists(deptIdNum);
        if (!exists) {
          errors.push("Department does not exist.");
        } else {
          updateData.department_id = deptIdNum;
        }
      }
    }

    const targetCatId = category_id !== undefined ? category_id : ticket_category_id;
    if (targetCatId !== undefined) {
      if (targetCatId === null || String(targetCatId).trim() === "") {
        errors.push("A ticket always has a category.");
      } else if (!isIntId(String(targetCatId))) {
        errors.push("Category ID must be a valid integer.");
      } else {
        const catIdNum = Number(targetCatId);
        const exists = await ticketService.checkCategoryExists(catIdNum);
        if (!exists) {
          errors.push("Category does not exist.");
        } else {
          updateData.category_id = catIdNum;
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const updatedTicket = await ticketService.updateTicket(ticketId, updateData, resolved.canWork);
    return res.status(200).json({ message: "Ticket updated successfully", ticket: updatedTicket });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * DELETE /api/tickets/:id (older screens): nothing is ever deleted any more. It is the requester's
 * Cancel, with the same rules as POST /:id/transition { to: "Cancelled" } (New / Pending approval).
 */
export const deleteTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const ticketId = parseIntId(req.params.id || req.body?.ticket_id || req.body?.id);
    const ticket = await lifecycle.transitionTicket(ticketId, user, "Cancelled", req.body?.note);
    return res.status(200).json({ message: "Request cancelled.", ticket });
  } catch (error) {
    return sendError(res, error);
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

/** POST /api/tickets/:id/comments { body, is_internal? } -> 201 { comment } */
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
    const comment = await timeline.addComment(ticketId, user, body, flag);
    return res.status(201).json({ message: flag ? "Internal note added." : "Reply sent.", comment });
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
