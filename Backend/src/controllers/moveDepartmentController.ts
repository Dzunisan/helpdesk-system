// S12 Move to another department (briefing p.20). OWNER: the move-department feature. Contract:
// docs/api-sprint-2.md "S12". Routes are already wired in routes/ticketRoutes.ts and
// routes/departmentRoutes.ts; replace these handlers.
import { notImplemented } from "../utils/notImplemented";

/** PATCH /api/tickets/:id/department { department_id, category_id, reason, message } */
export const moveDepartment = notImplemented("S12 PATCH /api/tickets/:id/department");

/** GET /api/departments/:id/categories (Agents and Leads: active categories for the move picker) */
export const departmentCategories = notImplemented("S12 GET /api/departments/:id/categories");
