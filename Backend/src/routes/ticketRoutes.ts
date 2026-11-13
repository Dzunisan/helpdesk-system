import { Router } from "express";
import {
  fetchTickets,
  getTicketById,
  assignTicket,
  addComment,
  getComments,
  editComment,
  deleteComment,
  submitFeedback,
  getFeedback,
  updateStatus,
  approveTicket,
  rejectTicket,
  getAgents
} from "../controllers/ticketsController";
import { requireAuth } from "../middleware/authMiddlware";
import { claimTicket, getTicketActions, transitionTicket } from "../controllers/lifecycleController";
import { changePriority } from "../controllers/triageController";
import { getTimeline } from "../controllers/timelineController";
import { createTicket } from "../services/ticketCreate";

const router = Router();

// All ticket routes require authentication
router.use(requireAuth);

// List available agents for reassignment (must be declared before /:id)
router.get("/agents", getAgents);

// Create a new ticket (S5): the category decides the department and the priority
router.post("/", createTicket);

// Retrieve list of tickets with filtering & pagination
router.get("/", fetchTickets);

// Assign (or self-assign / claim / reassign) ticket
router.put("/:id/assign", assignTicket);
router.patch("/:id/assign", assignTicket);
router.put("/:id/reassign", assignTicket);
router.patch("/:id/reassign", assignTicket);

// S2 lifecycle (docs/api-sprint-1.md): claim, move along the TRANSITIONS arrows, allowed buttons
router.post("/:id/claim", claimTicket);
router.post("/:id/transition", transitionTicket);
router.get("/:id/actions", getTicketActions);

// S3 triage: staff change priority, both due times recalculate from created_at
router.patch("/:id/priority", changePriority);

// S4 timeline: events + comments, filtered by role on the server
router.get("/:id/timeline", getTimeline);

// Older screens: PATCH /:id/status { status } is POST /:id/transition under another name (same
// arrows, same 403/409, same events). There is no free status path any more.
router.patch("/:id/status", updateStatus);
router.put("/:id/status", updateStatus);

// Lead Administrative Actions: Approve / Reject
router.patch("/:id/approve", approveTicket);
router.post("/:id/approve", approveTicket);
router.patch("/:id/reject", rejectTicket);
router.post("/:id/reject", rejectTicket);

// Comments endpoints
router.post("/:ticket_id/comments", addComment);
router.get("/:ticket_id/comments", getComments);
router.patch("/:ticket_id/comments/:id", editComment);
router.delete("/:ticket_id/comments/:id", deleteComment);

// Feedback endpoints
router.post("/:ticket_id/feedback", submitFeedback);
router.get("/:ticket_id/feedback", getFeedback);

// Retrieve details of a specific ticket
router.get("/:id", getTicketById);

// There is no free edit or delete: title and description belong to the requester's original
// message, a department move is a Sprint 2 lead action, and a requester withdraws a request with
// POST /:id/transition { to: "Cancelled" }.

export default router;