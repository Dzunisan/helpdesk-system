// S7 Canned responses / macros (briefing p.16, p.58). Contract: docs/api-sprint-2.md "S7".
//   - Agents and leads see the macros of their own department(s) only: an IT agent never sees an
//     HR macro, not in the list, not through render.
//   - Only the appointed lead of a department (department.lead_id) creates and edits its macros.
//   - Macros are never deleted: { active: false } hides them from the picker.
// Sending a macro reply is POST /api/tickets/:id/comments { body, macro_id, set_status }
// (services/extensions/commentMacro.ts: use_count + 1, set_status through the normal arrows).
import { pool } from "../config/database";
import { HttpError } from "../utils/httpError";
import { departmentsOf, loadTicketAccess, canWork, TICKET_NOT_FOUND } from "./ticketAccess";
import { ticketRef } from "./notify";
import { VALID_STATUSES, type TicketStatus } from "../types/ticket.types";
import type { User } from "../types/user.types";

export const MACRO_NOT_FOUND = "Macro not found.";
const MAX_TITLE = 120;
const MAX_BODY = 5000;

/** Statuses a macro may set after sending ("then set status"); the arrows still decide per ticket */
export const MACRO_STATUSES: TicketStatus[] = VALID_STATUSES.filter((s) =>
  (["Open", "Waiting on employee", "Resolved", "Cancelled"] as TicketStatus[]).includes(s)
);

export interface Macro {
  id: number;
  department_id: number;
  department_name: string | null;
  title: string;
  body: string;
  set_status: TicketStatus | null;
  is_internal: boolean;
  use_count: number;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderedMacro {
  macro_id: number;
  ticket_id: number;
  body: string;
  set_status: TicketStatus | null;
  is_internal: boolean;
}

const MACRO_SELECT = `
  SELECT m.id, m.department_id, d.department_name, m.title, m.body, m.set_status, m.is_internal,
         m.use_count, m.active, m.created_by::text AS created_by, m.updated_by::text AS updated_by,
         NULLIF(TRIM(CONCAT(ub.name, ' ', ub.surname)), '') AS updated_by_name,
         m.created_at, m.updated_at
  FROM canned_response m
  JOIN department d ON d.department_id = m.department_id
  LEFT JOIN users ub ON ub.user_id = COALESCE(m.updated_by, m.created_by)`;

const toMacro = (row: any): Macro => ({
  ...row,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
});

const loadMacro = async (id: number): Promise<Macro | null> => {
  const { rows } = await pool.query(`${MACRO_SELECT} WHERE m.id = $1`, [id]);
  return rows[0] ? toMacro(rows[0]) : null;
};

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** GET /api/macros?q=vpn: own department(s) only, most used first. include_inactive for leads. */
export const listMacros = async (user: User, q: string | null, includeInactive: boolean): Promise<Macro[]> => {
  const access = await loadTicketAccess(user);
  const departments = departmentsOf(access);
  if (departments.length === 0) return [];
  const values: unknown[] = [departments];
  const conditions = ["m.department_id = ANY($1::int[])"];
  // Only a lead sees deactivated macros, and only for the department(s) they lead (macros manager)
  if (includeInactive && access.role === "Department Lead") {
    values.push(access.led_department_ids ?? []);
    conditions.push(`(m.active OR m.department_id = ANY($${values.length}::int[]))`);
  } else {
    conditions.push("m.active");
  }
  const search = q?.trim();
  if (search) {
    values.push(`%${escapeLike(search.slice(0, 100))}%`);
    conditions.push(`(m.title ILIKE $${values.length} OR m.body ILIKE $${values.length})`);
  }
  const { rows } = await pool.query(
    `${MACRO_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY m.active DESC, m.use_count DESC, m.title`,
    values
  );
  return rows.map(toMacro);
};

const firstName = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * Fills the placeholders. Unknown {{...}} are left as typed so the agent sees them before sending.
 * The values are plain text (the composer and the timeline show text, never HTML).
 */
export const fillPlaceholders = (
  body: string,
  values: { requesterFirstName: string; ticketId: number; ticketTitle: string; agentFirstName: string }
): string => {
  const map: Record<string, string> = {
    "requester.first_name": values.requesterFirstName,
    "ticket.ref": ticketRef(values.ticketId),
    "ticket.title": values.ticketTitle,
    "agent.first_name": values.agentFirstName,
  };
  return body.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (whole, key: string) => map[key.toLowerCase()] ?? whole);
};

/**
 * GET /api/macros/:id/render?ticket=1048: the macro must be active and in the caller's department,
 * the ticket workable by the caller and in the macro's department. Anything else: 404.
 */
export const renderMacro = async (user: User, macroId: number, ticketId: number): Promise<RenderedMacro> => {
  const access = await loadTicketAccess(user);
  const { rows: ticketRows } = await pool.query(
    `SELECT t.ticket_id, t.title, t.requester_id::text AS requester_id, t.ticket_department_id,
            u.name AS requester_name
     FROM ticket t LEFT JOIN users u ON u.user_id = t.requester_id
     WHERE t.ticket_id = $1 AND t.deleted_at IS NULL`,
    [ticketId]
  );
  const ticket = ticketRows[0];
  if (!ticket || !canWork(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);

  const macro = await loadMacro(macroId);
  if (
    !macro ||
    !macro.active ||
    !departmentsOf(access).includes(macro.department_id) ||
    macro.department_id !== Number(ticket.ticket_department_id)
  ) {
    throw new HttpError(404, MACRO_NOT_FOUND);
  }
  return {
    macro_id: macro.id,
    ticket_id: ticket.ticket_id,
    body: fillPlaceholders(macro.body, {
      requesterFirstName: firstName(ticket.requester_name),
      ticketId: ticket.ticket_id,
      ticketTitle: ticket.title,
      agentFirstName: firstName(user.name),
    }),
    set_status: macro.set_status,
    is_internal: macro.is_internal,
  };
};

// ---------------------------------------------------------------------------------------------
// Lead: create / edit
// ---------------------------------------------------------------------------------------------

const cleanText = (value: unknown, field: "title" | "body"): string => {
  const max = field === "title" ? MAX_TITLE : MAX_BODY;
  const label = field === "title" ? "Title" : "Body";
  if (typeof value !== "string" || value.trim() === "") throw new HttpError(400, `${label} can't be empty.`);
  const text = field === "title" ? value.trim().replace(/\s+/g, " ") : value.trim();
  if (text.length > max) throw new HttpError(400, `${label} can be at most ${max} characters.`);
  return text;
};

const cleanStatus = (value: unknown): TicketStatus | null => {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "string" ? value.trim() : "";
  const status = MACRO_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  if (!status) {
    throw new HttpError(400, `Unknown status "${String(value)}".`, [
      `set_status must be one of: ${MACRO_STATUSES.join(", ")}, or null.`,
    ]);
  }
  return status;
};

const cleanBoolean = (value: unknown, field: string): boolean => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new HttpError(400, `${field} must be true or false.`);
};

const uniqueTitle = (error: unknown) => {
  if ((error as { code?: string })?.code === "23505") {
    throw new HttpError(409, "A macro with this title already exists in your department.");
  }
  throw error;
};

/** POST /api/macros: the department is the one the caller leads (department_id picks one if several) */
export const createMacro = async (user: User, input: Record<string, unknown>): Promise<Macro> => {
  const access = await loadTicketAccess(user);
  const led = access.led_department_ids ?? [];
  if (led.length === 0) throw new HttpError(403, "Only the lead of a department can create its macros.");
  let departmentId = led[0];
  if (input.department_id !== undefined && input.department_id !== null && input.department_id !== "") {
    const wanted = Number(input.department_id);
    if (!led.includes(wanted)) throw new HttpError(403, "You can only create macros for the department you lead.");
    departmentId = wanted;
  }
  const title = cleanText(input.title, "title");
  const body = cleanText(input.body, "body");
  const setStatus = cleanStatus(input.set_status);
  const isInternal = input.is_internal === undefined ? false : cleanBoolean(input.is_internal, "is_internal");

  const { rows } = await pool
    .query(
      `INSERT INTO canned_response (department_id, title, body, set_status, is_internal, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [departmentId, title, body, setStatus, isInternal, user.user_id]
    )
    .catch(uniqueTitle);
  return (await loadMacro(rows[0].id))!;
};

/** PATCH /api/macros/:id: the lead of the macro's department; anyone else 404 */
export const updateMacro = async (user: User, macroId: number, input: Record<string, unknown>): Promise<Macro> => {
  const access = await loadTicketAccess(user);
  const macro = await loadMacro(macroId);
  if (!macro || !(access.led_department_ids ?? []).includes(macro.department_id)) {
    throw new HttpError(404, MACRO_NOT_FOUND);
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if ("title" in input) set("title", cleanText(input.title, "title"));
  if ("body" in input) set("body", cleanText(input.body, "body"));
  if ("set_status" in input) set("set_status", cleanStatus(input.set_status));
  if ("is_internal" in input) set("is_internal", cleanBoolean(input.is_internal, "is_internal"));
  if ("active" in input) set("active", cleanBoolean(input.active, "active"));
  if (sets.length === 0) throw new HttpError(400, "Nothing to change.");

  set("updated_by", user.user_id);
  values.push(macroId);
  await pool
    .query(`UPDATE canned_response SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values)
    .catch(uniqueTitle);
  return (await loadMacro(macroId))!;
};
