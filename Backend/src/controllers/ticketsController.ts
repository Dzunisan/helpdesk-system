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
  UpdateTicketDto,
  TicketFilters
} from "../types/ticket.types";

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


export const fetchTickets = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // ticketAccess: System Admin (counts only) and Platform Admin (none) can't list ticket content
  const access = await loadTicketAccess(user);
  if (!canListTickets(access)) {
    return res.status(403).json({ message: "Forbidden: Your role does not have access to tickets." });
  }

  const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 100);
  const statusParam = req.query.status as string;
  const priorityParam = req.query.priority as string;
  const deptParam = (req.query.department_id || req.query.department) as string;
  const creatorParam = (req.query.creator_id || req.query.requester_id || req.query.creator) as string;
  const assigneeParam = (req.query.assignee_id || req.query.assignee) as string;
  const searchParam = req.query.search as string;

  // Validate status filter if given
  let normalizedStatus: string | null = null;
  if (statusParam) {
    const norm = normalizeStatus(statusParam);
    if (!norm) {
      return res.status(400).json({
        message: `Invalid status filter. Allowed values: ${VALID_STATUSES.join(", ")}.`
      });
    }
    normalizedStatus = norm;
  }

  // Validate priority filter if given
  let normalizedPriority: string | null = null;
  if (priorityParam) {
    const norm = normalizePriority(priorityParam);
    if (!norm) {
      return res.status(400).json({
        message: `Invalid priority filter. Allowed values: ${VALID_PRIORITIES.join(", ")}.`
      });
    }
    normalizedPriority = norm;
  }

  // Validate department_id filter if given
  let parsedDeptId: number | null = null;
  if (deptParam !== undefined && deptParam !== null && deptParam.trim() !== "") {
    if (!isIntId(deptParam.trim())) {
      return res.status(400).json({ message: "department_id must be a valid integer." });
    }
    parsedDeptId = Number(deptParam.trim());
  }

  // creator_id / assignee_id filters are user ids (bigint)
  const creatorId = creatorParam?.trim() || null;
  if (creatorId !== null && !isUserId(creatorId)) {
    return res.status(400).json({ message: "creator_id must be a valid user ID." });
  }
  const assigneeId = assigneeParam?.trim() || null;
  if (assigneeId !== null && !isUserId(assigneeId)) {
    return res.status(400).json({ message: "assignee_id must be a valid user ID." });
  }

  // Deleted tickets are never listed: only admins could see them, and admins have no ticket access
  const include_deleted = false;

  const filters: TicketFilters = {
    page,
    limit,
    status: normalizedStatus,
    priority: normalizedPriority,
    // Agents and Leads get their department from the role (ticketAccess); the browser's
    // department_id is ignored for them so it can never widen the scope
    department_id: STAFF_ROLES.includes(user.role) ? null : parsedDeptId,
    creator_id: creatorId,
    assignee_id: assigneeId,
    search: searchParam?.trim() || null,
    include_deleted
  };

  try {
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
    return handleError(res, error);
  }
};


export const getTicketById = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const rawId = req.params.id;
  const idParam = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idParam || !isIntId(idParam)) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(idParam);

  try {
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
    return handleError(res, error);
  }
};


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
      department_id,
      ticket_department_id,
      category_id,
      ticket_category_id,
      assignee_id
    } = req.body;

    // Assigning has its own rules (agents claim for themselves, leads assign within the
    // department), so it only goes through PUT /api/tickets/:id/assign
    if (assignee_id !== undefined) {
      return res.status(400).json({
        message: "Use PUT /api/tickets/:id/assign to assign or reassign a ticket."
      });
    }

    const errors: string[] = [];
    const updateData: UpdateTicketDto = {};

    // Requester restrictions: anyone who can't work the ticket (Employees, or staff who raised a
    // ticket in another department) may only edit its title and description. Every other field,
    // including the ticket_* aliases, is refused. Cancelling goes through PATCH /:id/status.
    if (!resolved.canWork) {
      const restrictedFields = [
        priority, status, assignee_id,
        department_id, ticket_department_id,
        category_id, ticket_category_id
      ];
      if (restrictedFields.some((value) => value !== undefined)) {
        return res.status(403).json({
          message: "Forbidden: You can only edit the title and description of your own tickets."
        });
      }
    }

    // Validate title
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        errors.push("Title cannot be empty.");
      } else if (title.trim().length > 255) {
        errors.push("Title must be 255 characters or fewer.");
      } else {
        updateData.title = title.trim();
      }
    }

    // Validate description
    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        errors.push("Description must be a string.");
      } else {
        updateData.description = description ? description.trim() : null;
      }
    }

    // Validate priority
    if (priority !== undefined && priority !== null) {
      const norm = normalizePriority(String(priority));
      if (!norm) {
        errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}.`);
      } else {
        updateData.priority = norm;
      }
    }

    // Validate status
    if (status !== undefined && status !== null) {
      const norm = normalizeStatus(String(status));
      if (!norm) {
        errors.push(`Status must be one of: ${VALID_STATUSES.join(", ")}.`);
      } else {
        // Only approve / reject may take a ticket through the approval step
        const approvalProblem = ticketService.approvalStepProblem(
          resolved.ticket.ticket_status,
          norm,
          resolved.isRequester
        );
        if (approvalProblem) {
          return res.status(409).json({ message: approvalProblem });
        }
        updateData.status = norm;
      }
    }

    // Validate department_id
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

    // Validate category_id
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

export const deleteTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

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

    // Only the ticket's requester can (soft-)delete it. Admins have no ticket access, so there
    // is no permanent delete path any more.
    if (!resolved.isRequester) {
      return res.status(403).json({ message: "Forbidden: You are not authorized to delete this ticket." });
    }

    const success = await ticketService.deleteTicket(ticketId);
    if (!success) {
      return res.status(404).json({ message: "Ticket could not be deleted." });
    }

    return res.status(200).json({ message: "Ticket soft-deleted successfully" });
  } catch (error) {
    return handleError(res, error);
  }
};

export const assignTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const idParam = req.params.id || req.body.ticket_id || req.body.id;
  if (!idParam || !isIntId(String(idParam).trim())) {
    return res.status(400).json({ message: "Invalid or missing ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(idParam).trim());
  const { assignee_id } = req.body;

  if (assignee_id !== undefined && assignee_id !== null && String(assignee_id).trim() !== "") {
    if (!isUserId(String(assignee_id).trim())) {
      return res.status(400).json({ message: "Assignee ID must be a valid user ID." });
    }
  }

  try {
    const result = await ticketService.assignTicket(
      ticketId,
      user,
      assignee_id !== undefined && assignee_id !== null && String(assignee_id).trim() !== ""
        ? String(assignee_id).trim()
        : null
    );

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      ticket: result.ticket
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /api/tickets/:ticket_id/comments
export const addComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.ticket_id || req.params.id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());
  const { body, comment, is_internal, internal_note } = req.body;
  const commentText = body !== undefined ? body : comment;

  if (!commentText || typeof commentText !== "string" || commentText.trim().length === 0) {
    return res.status(400).json({ message: "Comment body is required and cannot be empty." });
  }

  const flagInternal = Boolean(is_internal ?? internal_note ?? false);

  try {
    const result = await ticketService.addComment(ticketId, user, commentText, flagInternal);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      comment: result.comment
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /api/tickets/:ticket_id/comments
export const getComments = async (req: Request, res: Response) => {
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
    const result = await ticketService.getTicketComments(ticketId, user);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      comments: result.comments
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /api/comments/:id
export const editComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const commentIdParam = req.params.id || req.params.comment_id;
  if (!commentIdParam || !isIntId(String(commentIdParam).trim())) {
    return res.status(400).json({ message: "Invalid comment ID. Must be an integer." });
  }

  const commentId = Number(String(commentIdParam).trim());
  const { body, comment } = req.body;
  const commentText = body !== undefined ? body : comment;

  if (!commentText || typeof commentText !== "string" || commentText.trim().length === 0) {
    return res.status(400).json({ message: "Comment body is required and cannot be empty." });
  }

  try {
    const result = await ticketService.updateComment(commentId, user, commentText);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      comment: result.comment
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE /api/comments/:id
export const deleteComment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const commentIdParam = req.params.id || req.params.comment_id;
  if (!commentIdParam || !isIntId(String(commentIdParam).trim())) {
    return res.status(400).json({ message: "Invalid comment ID. Must be an integer." });
  }

  const commentId = Number(String(commentIdParam).trim());

  try {
    const result = await ticketService.deleteComment(commentId, user);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message
    });
  } catch (error) {
    return handleError(res, error);
  }
};

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

// PATCH /api/tickets/:id/status
export const updateStatus = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.id || req.params.ticket_id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "Status is required." });
  }

  const normalized = normalizeStatus(String(status));
  if (!normalized) {
    return res.status(400).json({
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.`
    });
  }

  try {
    const result = await ticketService.updateTicketStatus(ticketId, normalized, user);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      ticket: result.ticket
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /api/tickets/:id/approve
export const approveTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.id || req.params.ticket_id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());
  const { note } = req.body;

  try {
    const result = await ticketService.approveTicket(ticketId, user, note);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      ticket: result.ticket
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /api/tickets/:id/reject
export const rejectTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ticketIdParam = req.params.id || req.params.ticket_id;
  if (!ticketIdParam || !isIntId(String(ticketIdParam).trim())) {
    return res.status(400).json({ message: "Invalid ticket ID. Must be an integer." });
  }

  const ticketId = Number(String(ticketIdParam).trim());
  const { reason } = req.body;

  try {
    const result = await ticketService.rejectTicket(ticketId, user, reason);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    return res.status(result.statusCode).json({
      message: result.message,
      ticket: result.ticket
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

