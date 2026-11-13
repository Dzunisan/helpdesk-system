import { Router } from "express";
import {
  createTicket,
  fetchTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
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

const router = Router();

// All ticket routes require authentication
router.use(requireAuth);

// List available agents for reassignment (must be declared before /:id)
router.get("/agents", getAgents);

// Create a new ticket (POST /api/tickets is the Sprint 1 contract; /create is kept for old callers)
router.post("/", createTicket);
router.post("/create", createTicket);

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

// Agent / Admin Status Actions (superseded by POST /:id/transition in S2)
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

// Update ticket details or status
router.put("/update/:id", updateTicket);
router.patch("/update/:id", updateTicket);

// Delete or soft-delete a ticket
router.delete("/delete/:id", deleteTicket);
router.delete("/:id", deleteTicket);

export default router;