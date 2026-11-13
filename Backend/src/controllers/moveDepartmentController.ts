// S12 Move to another department (briefing p.20). Contract: docs/api-sprint-2.md "S12".
// Routes: PATCH /api/tickets/:id/department (routes/ticketRoutes.ts) and
// GET /api/departments/:id/categories (routes/departmentRoutes.ts). The work is in services/ticketMove.ts.
import { Request, Response } from "express";
import { STAFF_ROLES } from "../services/ticketAccess";
import { activeDepartmentCategories, moveTicketDepartment } from "../services/ticketMove";
import { parseIntId, sendError } from "../utils/httpError";

/** PATCH /api/tickets/:id/department { department_id, category_id, reason, message? } */
export const moveDepartment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticketId = parseIntId(req.params.id);
    const { ticket, to_department_name } = await moveTicketDepartment(ticketId, user, req.body);
    return res.status(200).json({ message: `Moved to ${to_department_name}.`, ticket });
  } catch (error) {
    return sendError(res, error, "Move department error");
  }
};

/** GET /api/departments/:id/categories (Agents and Leads: active categories for the move picker) */
export const departmentCategories = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (!STAFF_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
  try {
    const departmentId = parseIntId(req.params.id, "department");
    return res.status(200).json({ categories: await activeDepartmentCategories(departmentId) });
  } catch (error) {
    return sendError(res, error, "Department categories error");
  }
};
