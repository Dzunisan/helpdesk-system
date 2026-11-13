// The ticket timeline's write side (briefing p.13, S4). Every ticket mutation calls logEvent() with
// the SAME transaction client as the change itself, so a change and its history row commit or roll
// back together. ticket_event is append-only: nothing updates or deletes its rows.
import type { PoolClient } from "pg";
import type { TicketEvent, TicketEventType } from "../types/ticket.types";

export interface LogEventInput {
  ticketId: number;
  /** Who did it; null for the system (e.g. auto-close after 5 days) */
  actorId: string | number | null;
  type: TicketEventType;
  /** Old value, e.g. "New" for a status change or "Normal" for a priority change */
  from?: string | null;
  /** New value, e.g. "Open", "High", or the new assignee's user id for "assigned" */
  to?: string | null;
  /** Free text shown with the event: resolution note, rejection reason, reassignment reason */
  note?: string | null;
  /** Staff-only events never reach the requester (GET /timeline filters them out) */
  isInternal?: boolean;
}

/**
 * Appends one row to ticket_event inside the caller's transaction and returns it.
 * Takes a PoolClient (from withTransaction), never the pool: an event written outside the
 * change's transaction could survive a rolled-back change.
 * @example
 *   await withTransaction(async (client) => {
 *     await client.query("UPDATE ticket SET ticket_priority = $1 ... WHERE ticket_id = $2", ["High", id]);
 *     await logEvent(client, { ticketId: id, actorId: user.user_id, type: "priority_changed", from: "Normal", to: "High" });
 *   });
 */
export const logEvent = async (client: PoolClient, input: LogEventInput): Promise<TicketEvent> => {
  const { rows } = await client.query<TicketEvent>(
    `INSERT INTO ticket_event (ticket_id, actor_id, type, from_value, to_value, note, is_internal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING event_id, ticket_id, actor_id::text AS actor_id, type, from_value, to_value, note, is_internal, created_at`,
    [
      input.ticketId,
      input.actorId === null ? null : String(input.actorId),
      input.type,
      input.from ?? null,
      input.to ?? null,
      input.note ?? null,
      input.isInternal ?? false,
    ]
  );
  return rows[0];
};
