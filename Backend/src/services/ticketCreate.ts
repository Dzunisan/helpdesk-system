// POST /api/tickets (S5 Guided requests with category routing, briefing p.14; contract:
// docs/api-sprint-1.md "S5"). The category decides everything the employee shouldn't:
//   department  = category.department_id
//   priority    = category.default_priority (Agents and Leads may send their own, but only for a
//                 category of a department they work in: page 12, triage is their own department's)
//   status      = "Pending approval" when category.needs_approval, else "New"
//   due times   = created_at + the SLA policy (sla.ts); none while Pending approval (S6 starts the clock)
// Whatever else the browser sends (department, status, requester) is ignored. Required extra fields
// are validated here: 400 { message, errors, field_errors }. The ticket and its "created" event are
// written in one transaction.
import { Request, Response } from "express";
import { withTransaction } from "../config/database";
import { logEvent } from "./events";
import { computeDueTimes, loadSlaPolicies } from "./sla";
import { NO_TICKET_ACCESS_ROLES, STAFF_ROLES, departmentsOf, loadTicketAccess } from "./ticketAccess";
import { getCategoryForTicket, isIntId } from "./categoryService";
import { getTicketById } from "./ticketService";
import type { CategoryField } from "../types/category.types";
import {
  VALID_IMPACTS,
  VALID_PRIORITIES,
  type TicketImpact,
  type TicketPriority,
  type TicketStatus,
} from "../types/ticket.types";

const TEXT_MAX = 255;
const LONG_TEXT_MAX = 5000;
const DESCRIPTION_MAX = 10000;

export type ExtraFieldValue = string | number;

const isBlank = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** "3 960", "3960.50" and "1,5" all count as numbers (spaces are thousands separators in ZA) */
const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[\s ]/g, "");
  if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const d = new Date(`${value.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value.trim();
};

/**
 * Checks the answers against the category's extra fields (page 39, 63). Returns the clean answers
 * (only the category's keys; numbers as numbers, text trimmed) and one message per bad field.
 */
export const validateExtraFields = (
  fields: CategoryField[],
  answers: Record<string, unknown>
): { values: Record<string, ExtraFieldValue>; fieldErrors: Record<string, string> } => {
  const values: Record<string, ExtraFieldValue> = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of fields) {
    const raw = answers[field.key];
    if (isBlank(raw)) {
      if (field.required) fieldErrors[field.key] = `${field.label} is required.`;
      continue;
    }
    switch (field.type) {
      case "number": {
        const n = parseNumber(raw);
        if (n === null) fieldErrors[field.key] = `${field.label} must be a number.`;
        else values[field.key] = n;
        break;
      }
      case "date":
        if (!isIsoDate(raw)) fieldErrors[field.key] = `${field.label} must be a date (YYYY-MM-DD).`;
        else values[field.key] = raw.trim();
        break;
      default: {
        if (typeof raw !== "string" && typeof raw !== "number") {
          fieldErrors[field.key] = `${field.label} must be text.`;
          break;
        }
        const text = String(raw).trim();
        const max = field.type === "long_text" ? LONG_TEXT_MAX : TEXT_MAX;
        if (text.length > max) fieldErrors[field.key] = `${field.label} must be ${max} characters or fewer.`;
        else values[field.key] = text;
      }
    }
  }
  return { values, fieldErrors };
};

const fail = (res: Response, errors: string[], fieldErrors?: Record<string, string>) =>
  res.status(400).json({
    message: errors.length === 1 && !fieldErrors ? errors[0] : "Validation failed",
    errors,
    ...(fieldErrors ? { field_errors: fieldErrors } : {}),
  });

/** POST /api/tickets -> 201 { ticket, reference } */
export const createTicket = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  // System Admin (counts only) and Platform Admin (none) have no ticket access, so they don't raise tickets
  if (NO_TICKET_ACCESS_ROLES.includes(user.role)) {
    return res.status(403).json({ message: "Administrators can't raise tickets." });
  }
  const isStaff = STAFF_ROLES.includes(user.role);
  const body = req.body ?? {};
  const errors: string[] = [];

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title === "") errors.push("Title is required.");
  else if (title.length > 255) errors.push("Title must be 255 characters or fewer.");

  let description: string | null = null;
  if (!isBlank(body.description)) {
    if (typeof body.description !== "string") errors.push("Description must be text.");
    else if (body.description.trim().length > DESCRIPTION_MAX) {
      errors.push(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
    } else description = body.description.trim();
  }

  let impact: TicketImpact | null = null;
  if (!isBlank(body.impact)) {
    if (!VALID_IMPACTS.includes(body.impact)) errors.push(`Impact must be one of: ${VALID_IMPACTS.join(", ")}.`);
    else impact = body.impact;
  }

  // Priority: staff only. An employee's priority is ignored, never an error.
  let staffPriority: TicketPriority | null = null;
  if (isStaff && !isBlank(body.priority)) {
    const match = VALID_PRIORITIES.find((p) => p.toLowerCase() === String(body.priority).trim().toLowerCase());
    if (!match) errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    else staffPriority = match;
  }

  const answers = body.extra_fields;
  if (!isBlank(answers) && (typeof answers !== "object" || Array.isArray(answers))) {
    errors.push("extra_fields must be an object.");
  }

  // The category decides the department; a department_id from the browser is ignored
  const rawCategory = body.category_id ?? body.ticket_category_id;
  let categoryId: number | null = null;
  if (isBlank(rawCategory)) errors.push("Choose a category.");
  else if (!isIntId(rawCategory)) errors.push("Category ID must be a valid integer.");
  else categoryId = Number(rawCategory);

  if (errors.length > 0 || categoryId === null) return fail(res, errors);

  try {
    const category = await getCategoryForTicket(categoryId);
    if (!category) return fail(res, ["That category doesn't exist. Choose another."]);
    if (!category.active || category.department_status !== "active") {
      return fail(res, ["This category is no longer offered. Choose another."]);
    }

    const fields = Array.isArray(category.fields) ? category.fields : [];
    const { values, fieldErrors } = validateExtraFields(
      fields,
      answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {}
    );
    if (Object.keys(fieldErrors).length > 0) {
      return fail(res, Object.values(fieldErrors), fieldErrors);
    }

    // Staff triage only their own department (page 12). An agent raising a ticket for another
    // department is a requester there: the category's default priority applies, as for employees.
    if (staffPriority !== null) {
      const ownDepartments = departmentsOf(await loadTicketAccess(user));
      if (!ownDepartments.includes(Number(category.department_id))) staffPriority = null;
    }

    const priority: TicketPriority = staffPriority ?? category.default_priority;
    const status: TicketStatus = category.needs_approval ? "Pending approval" : "New";
    const requesterId = String(user.user_id);

    const ticketId = await withTransaction(async (client) => {
      const now = new Date();
      // Pending approval has no clock yet: the team can't act until the lead approves (S6 sets them then)
      const due =
        status === "Pending approval"
          ? { first_response_due_at: null, resolution_due_at: null }
          : computeDueTimes(now, priority, await loadSlaPolicies(client));
      const { rows } = await client.query(
        `INSERT INTO ticket (
           title, description, ticket_department_id, ticket_category_id, ticket_priority, ticket_status,
           impact, extra_fields, requester_id, first_response_due_at, resolution_due_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $12)
         RETURNING ticket_id`,
        [
          title,
          description,
          category.department_id,
          category.category_id,
          priority,
          status,
          impact,
          JSON.stringify(values),
          requesterId,
          due.first_response_due_at,
          due.resolution_due_at,
          now,
        ]
      );
      const id: number = rows[0].ticket_id;
      await logEvent(client, { ticketId: id, actorId: requesterId, type: "created", to: status });
      return id;
    });

    const ticket = await getTicketById(ticketId, false);
    return res.status(201).json({ message: "Request submitted", reference: `HD-${ticketId}`, ticket });
  } catch (error: any) {
    console.error("Ticket create error:", error);
    if (error?.code === "23503") {
      return fail(res, ["That category or department doesn't exist."]);
    }
    return res.status(500).json({ message: "An unexpected error occurred" });
  }
};
