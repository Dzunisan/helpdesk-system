import { Request, Response } from "express";
import * as reportService from "../services/reportService";
import * as dashboard from "../services/dashboardReports";
import { getTickets } from "../services/ticketService";
import { loadTicketAccess } from "../services/ticketAccess";
import { runJobsSoon } from "../services/jobs";
import { ACTIVE_STATUSES, type Ticket } from "../types/ticket.types";
import type { User } from "../types/user.types";
import { HttpError, sendError } from "../utils/httpError";

// GET /api/reports/admin-overview (System Admin): organisation counts, never ticket content
export const adminOverview = async (_req: Request, res: Response) => {
  try {
    const overview = await reportService.getAdminOverview();
    return res.status(200).json(overview);
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ message: "Could not load the admin overview." });
  }
};

// ---------------------------------------------------------------------------------------------
// S8 lead dashboard (briefing p.17, docs/api-sprint-2.md "S8"). Lead: own department forced on the
// server (?department_id= only picks between departments they lead, so the IT lead never sees HR
// numbers). System Admin: ?department_id= optional (none = every department), aggregates only.
// ---------------------------------------------------------------------------------------------

const one = (value: unknown): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === null || raw === "" ? undefined : String(raw);
};

const parseDays = (value: unknown, fallback: number, max: number): number => {
  const raw = one(value);
  if (raw === undefined) return fallback;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
    throw new HttpError(400, `days must be a whole number from 1 to ${max}.`);
  }
  return Number(raw);
};

/** The department the numbers are for: a lead's own (forced), or the admin's choice / null = all */
const reportDepartment = async (user: User, query: Request["query"]): Promise<number | null> => {
  const raw = one(query.department_id);
  const requested = raw !== undefined && /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
  if (user.role === "Department Lead") {
    const access = await loadTicketAccess(user);
    const led = access.led_department_ids ?? [];
    if (led.length === 0) throw new HttpError(403, "You don't lead a department yet, so there's no dashboard to show.");
    return requested !== undefined && led.includes(requested) ? requested : led[0];
  }
  if (user.role === "System Admin") {
    if (raw === undefined || raw === "all") return null;
    if (requested === undefined) throw new HttpError(400, "department_id must be a department id.");
    if (!(await dashboard.findDepartment(requested))) throw new HttpError(404, "Department not found.");
    return requested;
  }
  throw new HttpError(403, "Forbidden");
};

const handle =
  (label: string, fn: (user: User, req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      // The jobs (auto-close, breach alerts, outbox) also run when a dashboard loads (throttled)
      runJobsSoon();
      return res.status(200).json(await fn(user, req));
    } catch (error) {
      return sendError(res, error, label);
    }
  };

/** GET /api/reports/summary?days=30 -> ReportSummary */
export const reportSummary = handle("Report summary error", async (user, req) => {
  const days = parseDays(req.query.days, 30, 365);
  return dashboard.getReportSummary(await reportDepartment(user, req.query), days);
});

/** GET /api/reports/workload?days=30 -> { agents: WorkloadRow[] } */
export const reportWorkload = handle("Workload report error", async (user, req) => {
  const days = parseDays(req.query.days, 30, 365);
  return { agents: await dashboard.getWorkload(await reportDepartment(user, req.query), days) };
});

/** GET /api/reports/daily?days=14 -> { days: [{ date, created, resolved }] } */
export const reportDaily = handle("Daily report error", async (user, req) => {
  const days = parseDays(req.query.days, 14, 90);
  return { days: await dashboard.getDaily(await reportDepartment(user, req.query), days) };
});

const BREACHES_LIMIT = 10;

/**
 * GET /api/reports/breaches -> { tickets: Ticket[] }: the lead's live tickets, breached first, then
 * due soon, nearest due time first (at most 10). Ticket content, so the System Admin gets 403.
 * Uses the normal ticket list with the department's scope, so each row has the same shape and SLA
 * state as the queues.
 */
export const reportBreaches = handle("Breaches report error", async (user, req) => {
  if (user.role !== "Department Lead") throw new HttpError(403, "Only a department lead can see breached tickets.");
  const departmentId = await reportDepartment(user, req.query);
  // The department's tickets only (not the lead's own requests elsewhere): an agent-level scope
  const scope = { user_id: "0", role: "Agent", department_id: departmentId };
  const base = {
    statuses: ACTIVE_STATUSES,
    department_id: departmentId,
    sort: "due" as const,
    page: 1,
  };
  const breached = await getTickets({ ...base, sla: "breached", limit: BREACHES_LIMIT }, scope);
  let tickets: Ticket[] = breached.tickets;
  if (tickets.length < BREACHES_LIMIT) {
    const dueSoon = await getTickets({ ...base, sla: "due_soon", limit: BREACHES_LIMIT - tickets.length }, scope);
    tickets = [...tickets, ...dueSoon.tickets];
  }
  return { tickets };
});
