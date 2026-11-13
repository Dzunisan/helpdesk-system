import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import {
  adminOverview,
  reportBreaches,
  reportDaily,
  reportSummary,
  reportWorkload,
} from "../controllers/reportsController";

const router = Router();

router.use(requireAuth);

// Counts only (department table + set-up checklist on the System Admin overview, briefing p.60)
router.get("/admin-overview", requireRole("System Admin"), adminOverview);

// S8 lead dashboard (briefing p.17, docs/api-sprint-2.md). Lead: own department forced on the
// server; System Admin: ?department_id= (aggregates only; /breaches is ticket content, so 403).
// GET /api/reports/csat (S10) lives in routes/csatRoutes.ts, mounted on the same prefix.
const leadOrAdmin = requireRole("Department Lead", "System Admin");
router.get("/summary", leadOrAdmin, reportSummary);
router.get("/workload", leadOrAdmin, reportWorkload);
router.get("/breaches", leadOrAdmin, reportBreaches);
router.get("/daily", leadOrAdmin, reportDaily);

export default router;
