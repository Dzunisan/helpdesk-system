// S2 Ticket lifecycle & ownership (briefing p.11). Contract: docs/api-sprint-1.md "S2".
// Rules: TRANSITIONS / checkTransition() / allowedTransitions() in src/types/ticket.types.ts;
// access: src/services/ticketAccess.ts; history: logEvent() inside withTransaction().
import { notImplemented } from "../utils/notImplemented";

/** POST /api/tickets/:id/claim  -> assignee = me, status Open, row lock, "claimed" event */
export const claimTicket = notImplemented("S2 POST /api/tickets/:id/claim");

/** POST /api/tickets/:id/transition { to, note? } -> 409 if the arrow doesn't exist, 403 wrong person */
export const transitionTicket = notImplemented("S2 POST /api/tickets/:id/transition");

/** GET /api/tickets/:id/actions -> the buttons this user may see right now */
export const getTicketActions = notImplemented("S2 GET /api/tickets/:id/actions");
