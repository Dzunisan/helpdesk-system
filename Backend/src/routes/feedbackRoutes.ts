import { Router } from "express";
import { requireAuth } from "../middleware/authMiddlware";
import { getFeedback, submitFeedback } from "../controllers/feedbackController";

// S10 CSAT survey per ticket (briefing p.19, docs/api-sprint-2.md "S10"). Mounted at /api/tickets
// BEFORE routes/ticketRoutes.ts, so these handlers answer /api/tickets/:id/feedback.
const router = Router();

router.use("/:id/feedback", requireAuth);

// The requester, or staff of the ticket's department (404 everyone else)
router.get("/:id/feedback", getFeedback);
// The requester only, once, when Closed (403 staff, 409 already rated / not Closed)
router.post("/:id/feedback", submitFeedback);

export default router;
