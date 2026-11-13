// S3 Priority triage (briefing p.12). Contract: docs/api-sprint-1.md "S3".
// Maths: computeDueTimes() / slaState() / SQL_NEXT_DUE / SQL_IS_BREACHED in src/services/sla.ts.
import { notImplemented } from "../utils/notImplemented";

/** PATCH /api/tickets/:id/priority { priority } -> staff only; recompute both due times from created_at; "priority_changed" event */
export const changePriority = notImplemented("S3 PATCH /api/tickets/:id/priority");
