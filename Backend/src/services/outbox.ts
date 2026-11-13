// S9 outbox (briefing p.18): every message the app would send is a row in `outbox`, written by
// notify() inside the change's transaction. sendPending() delivers them AFTER commit:
//   email  -> through the one SMTP transport in utils/smtp.ts: SENT, or FAILED with the error.
//             When SMTP isn't configured (no EMAIL_PASS, e.g. test servers) -> SIMULATED, never sent.
//   sms / whatsapp / push -> never sent (zero cost rule, p.3): always SIMULATED.
// The System Admin's "Sent messages" page lists this table (GET /api/admin/outbox).
import { pool } from "../config/database";
import { fromAddress, getTransport, isEmailConfigured } from "../utils/smtp";

export type OutboxStatus = "QUEUED" | "SENT" | "FAILED" | "SIMULATED";
export type OutboxChannel = "email" | "sms" | "whatsapp" | "push";

export interface SendSummary {
  sent: number;
  failed: number;
  simulated: number;
}

/** Give up on a FAILED email after this many tries (Run jobs now retries the rest) */
export const MAX_ATTEMPTS = 3;
const BATCH = 50;

interface OutboxRow {
  id: string;
  channel: OutboxChannel;
  recipient: string;
  subject: string;
  body: string;
}

/** Plain-text twin of the HTML body for mail clients that don't render HTML */
const toText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const mark = (id: string, status: OutboxStatus, error: string | null = null) =>
  pool.query(
    `UPDATE outbox
     SET status = $2, error = $3, attempts = attempts + 1,
         sent_at = CASE WHEN $2 = 'SENT' THEN now() ELSE sent_at END
     WHERE id = $1`,
    [id, status, error]
  );

let running: Promise<SendSummary> | null = null;
let again = false;

const drain = async (retryFailed: boolean): Promise<SendSummary> => {
  const summary: SendSummary = { sent: 0, failed: 0, simulated: 0 };
  if (retryFailed) {
    await pool.query(`UPDATE outbox SET status = 'QUEUED' WHERE status = 'FAILED' AND attempts < $1`, [MAX_ATTEMPTS]);
  }
  for (;;) {
    const { rows } = await pool.query<OutboxRow>(
      `SELECT id::text AS id, channel, recipient, subject, body
       FROM outbox WHERE status = 'QUEUED' ORDER BY id LIMIT $1`,
      [BATCH]
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.channel !== "email" || !isEmailConfigured()) {
        await mark(row.id, "SIMULATED");
        summary.simulated++;
        continue;
      }
      try {
        await getTransport().sendMail({
          from: fromAddress(),
          to: row.recipient,
          subject: row.subject,
          html: row.body,
          text: toText(row.body),
        });
        await mark(row.id, "SENT");
        summary.sent++;
      } catch (error) {
        await mark(row.id, "FAILED", ((error as Error).message || "Send failed").slice(0, 500));
        summary.failed++;
      }
    }
  }
  return summary;
};

/**
 * Delivers every QUEUED outbox row (see the header). Call AFTER the transaction that queued them has
 * committed. One run at a time per server: a call while a run is busy waits for it and runs once more.
 * @param retryFailed also re-queue FAILED emails with fewer than MAX_ATTEMPTS tries (Run jobs now)
 */
export const sendPending = async ({ retryFailed = false } = {}): Promise<SendSummary> => {
  if (running) {
    again = true;
    await running.catch(() => undefined);
    if (running) return running;
  }
  const run = (async () => {
    const total: SendSummary = { sent: 0, failed: 0, simulated: 0 };
    let retry = retryFailed;
    do {
      again = false;
      const s = await drain(retry);
      retry = false;
      total.sent += s.sent;
      total.failed += s.failed;
      total.simulated += s.simulated;
    } while (again);
    return total;
  })();
  running = run;
  try {
    return await run;
  } finally {
    running = null;
  }
};

/** Fire and forget after a commit: errors are logged, never thrown at the request that queued them */
export const sendPendingSoon = (): void => {
  sendPending().catch((error) => console.error("[outbox] sendPending failed:", error));
};
