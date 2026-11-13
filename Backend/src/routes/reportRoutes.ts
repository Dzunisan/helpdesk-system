import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { adminOverview } from "../controllers/reportsController";

const router = Router();

router.use(requireAuth);

// Counts only (department table + set-up checklist on the System Admin overview, briefing p.60)
router.get("/admin-overview", requireRole("System Admin"), adminOverview);

export default router;
