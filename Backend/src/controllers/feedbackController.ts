// S10 CSAT survey reports (briefing p.19). OWNER: the CSAT feature. Contract: docs/api-sprint-2.md
// "S10". The per-ticket endpoints (GET/POST /api/tickets/:id/feedback) are in ticketsController.ts
// (submitFeedback / getFeedback) and services/ticketService.ts, also owned by the CSAT feature.
import { notImplemented } from "../utils/notImplemented";

/** GET /api/reports/csat?days=30 (Lead: own department; System Admin: ?department_id= or all) */
export const csatReport = notImplemented("S10 GET /api/reports/csat");
