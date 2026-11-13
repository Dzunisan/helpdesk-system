import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { adminOverview } from "../controllers/reportsController";
import { notImplemented } from "../utils/notImplemented";

const router = Router();

router.use(requireAuth);

// Counts only (department table + set-up checklist on the System Admin overview, briefing p.60)
router.get("/admin-overview", requireRole("System Admin"), adminOverview);

// S8 lead dashboard (briefing p.17, docs/api-sprint-2.md). OWNER: the dashboard feature; replace the
// handlers. Lead: own department forced on the server; System Admin: ?department_id= (aggregates only).
// GET /api/reports/csat (S10) lives in routes/csatRoutes.ts, mounted on the same prefix.
const leadOrAdmin = requireRole("Department Lead", "System Admin");
router.get("/summary", leadOrAdmin, notImplemented("S8 GET /api/reports/summary"));
router.get("/workload", leadOrAdmin, notImplemented("S8 GET /api/reports/workload"));
router.get("/breaches", leadOrAdmin, notImplemented("S8 GET /api/reports/breaches"));
router.get("/daily", leadOrAdmin, notImplemented("S8 GET /api/reports/daily"));

export default router;
