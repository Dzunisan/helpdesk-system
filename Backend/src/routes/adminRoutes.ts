import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { listOutbox, runJobsNow } from "../controllers/adminController";

const router = Router();

router.use(requireAuth, requireRole("System Admin"));

// S9 (briefing p.18, docs/api-sprint-2.md): Sent messages + Run jobs now
router.get("/outbox", listOutbox);
router.post("/jobs/run", runJobsNow);

export default router;
