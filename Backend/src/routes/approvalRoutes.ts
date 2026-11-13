import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { countApprovals, listApprovals } from "../controllers/approvalsController";

const router = Router();

router.use(requireAuth);

// S6 (briefing p.15, docs/api-sprint-2.md). Approve / reject are POST /api/tickets/:id/approve|reject.
router.get("/", requireRole("Department Lead"), listApprovals);
router.get("/count", requireRole("Department Lead"), countApprovals);

export default router;
