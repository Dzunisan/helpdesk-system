import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { csatReport } from "../controllers/feedbackController";

// Mounted at /api/reports NEXT TO routes/reportRoutes.ts (S8), so the CSAT feature (S10) never
// edits the S8 file.
const router = Router();

router.use(requireAuth);

// S10 (briefing p.19, docs/api-sprint-2.md)
router.get("/csat", requireRole("Department Lead", "System Admin"), csatReport);

export default router;
