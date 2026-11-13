// Regression test (Sprint 2 review, S7/S9): an internal note never resolves a ticket, so its text
// can't reach the employee as the resolution note, a notification, an outbox email or a public
// timeline event. Runs against a freshly seeded database (never helpdesk_dev):
//   DB_DATABASE=helpdesk_x pnpm db:reset && DB_DATABASE=helpdesk_x npx tsx --test tests/internalNoteResolve.test.ts
import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/config/database";
import { addComment } from "../src/services/ticketTimeline";
import { createMacro } from "../src/services/macroService";
import type { User } from "../src/types/user.types";

if (process.env.DB_DATABASE === "helpdesk_dev") throw new Error("Run this against a test database, not helpdesk_dev.");

const userByEmail = async (prefix: string): Promise<User> => {
  const { rows } = await pool.query(
    `SELECT user_id::text AS user_id, name, surname, email, role::text AS role, active, created_at, department_id
     FROM users WHERE email = $1`,
    [`${prefix}@mzansifreight.co.za`]
  );
  assert.ok(rows[0], `seed user ${prefix} missing: run pnpm db:reset first`);
  return rows[0];
};

/** Every place the note could leak to the requester */
const leaks = async (ticketId: number, marker: string) => {
  const like = `%${marker}%`;
  const [ticket, notes, mails, events] = await Promise.all([
    pool.query(`SELECT ticket_status, resolution_note FROM ticket WHERE ticket_id = $1`, [ticketId]),
    pool.query(`SELECT 1 FROM notification WHERE ticket_id = $1 AND (body ILIKE $2 OR title ILIKE $2)`, [ticketId, like]),
    pool.query(`SELECT 1 FROM outbox WHERE ticket_id = $1 AND body ILIKE $2`, [ticketId, like]),
    pool.query(`SELECT 1 FROM ticket_event WHERE ticket_id = $1 AND NOT is_internal AND note ILIKE $2`, [ticketId, like]),
  ]);
  return {
    status: ticket.rows[0].ticket_status as string,
    resolutionNote: ticket.rows[0].resolution_note as string | null,
    notifications: notes.rowCount,
    emails: mails.rowCount,
    publicEvents: events.rowCount,
  };
};

after(() => pool.end());

test("an internal note with set_status Resolved leaves the ticket open and the text staff-only", async () => {
  const thabo = await userByEmail("thabo");
  const marker = `INTERNAL-ONLY-${Date.now()}`;
  const result = await addComment(1041, thabo, `${marker}: johan reused his old password`, true, { setStatus: "Resolved" });
  assert.equal(result.set_status?.applied, false);
  assert.deepEqual(await leaks(1041, marker), { status: "Open", resolutionNote: null, notifications: 0, emails: 0, publicEvents: 0 });
});

test("an internal note sent with the seeded Resolved macro does not resolve either", async () => {
  const thabo = await userByEmail("thabo");
  const { rows } = await pool.query(`SELECT id FROM canned_response WHERE set_status = 'Resolved' AND department_id = 1 LIMIT 1`);
  const marker = `MACRO-INTERNAL-${Date.now()}`;
  const result = await addComment(1045, thabo, `${marker} note`, true, { macroId: rows[0].id });
  assert.equal(result.set_status?.applied, false);
  assert.deepEqual(await leaks(1045, marker), { status: "Open", resolutionNote: null, notifications: 0, emails: 0, publicEvents: 0 });
});

test("a macro can't be both an internal note and Resolved", async () => {
  const thandi = await userByEmail("thandi");
  await assert.rejects(
    createMacro(thandi, { title: `Internal resolve ${Date.now()}`, body: "x", set_status: "Resolved", is_internal: true }),
    (error: { status?: number }) => error.status === 400
  );
});
