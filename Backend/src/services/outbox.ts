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

// ---------------------------------------------------------------------------------------------
// Account emails (welcome, password reset): sent at once, never queued, but still one outbox row
// each so "Sent messages" lists every email the app sent. Their secrets (temporary password, reset
// link) are only in the email itself: the row keeps a copy with them blanked out, and is written
// with MAX_ATTEMPTS so sendPending never re-sends that blanked copy.
// ---------------------------------------------------------------------------------------------

export interface DirectEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The HTML kept in the outbox row: the same email with its secrets replaced */
  storedHtml: string;
  userId?: string | number | null;
}

/**
 * Sends one account email now through utils/smtp.ts and records it in the outbox (SENT, FAILED or,
 * when SMTP isn't configured, SIMULATED). Returns the status; throws when the send failed, so
 * callers keep their own error handling.
 */
export const sendDirectEmail = async (email: DirectEmail): Promise<OutboxStatus> => {
  let status: OutboxStatus = "SIMULATED";
  let error: string | null = null;
  if (isEmailConfigured()) {
    try {
      await getTransport().sendMail({
        from: fromAddress(),
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = ((e as Error).message || "Send failed").slice(0, 500);
    }
  }
  try {
    const userId = email.userId === null || email.userId === undefined ? null : String(email.userId);
    await pool.query(
      `INSERT INTO outbox (channel, recipient, user_id, subject, body, status, error, attempts, sent_at)
       VALUES ('email', $1,
               COALESCE((SELECT user_id FROM users WHERE user_id::text = $2),
                        (SELECT user_id FROM users WHERE lower(email) = lower($1) LIMIT 1)),
               $3, $4, $5, $6, $7,
               CASE WHEN $5 = 'SENT' THEN now() END)`,
      [email.to, userId, email.subject, email.storedHtml, status, error, MAX_ATTEMPTS]
    );
  } catch (e) {
    console.error("[outbox] Could not record an account email:", (e as Error).message);
  }
  if (status === "FAILED") throw new Error(error ?? "Send failed");
  return status;
};

// ---------------------------------------------------------------------------------------------
// GET /api/admin/outbox (System Admin "Sent messages"): newest first, no HTML body
// ---------------------------------------------------------------------------------------------

export const OUTBOX_STATUSES: OutboxStatus[] = ["QUEUED", "SENT", "FAILED", "SIMULATED"];
export const OUTBOX_CHANNELS: OutboxChannel[] = ["email", "sms", "whatsapp", "push"];

export interface OutboxFilters {
  status?: OutboxStatus;
  channel?: OutboxChannel;
  /** YYYY-MM-DD, a day in SAST */
  date?: string;
  page: number;
  limit: number;
}

export const listOutboxMessages = async (filters: OutboxFilters) => {
  // Every filter but status: the status chips show what each status would list
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.channel) {
    values.push(filters.channel);
    where.push(`o.channel = $${values.length}`);
  }
  if (filters.date) {
    values.push(filters.date);
    where.push(`(o.created_at AT TIME ZONE 'Africa/Johannesburg')::date = $${values.length}::date`);
  }

  const { rows: countRows } = await pool.query<{ status: OutboxStatus; n: number }>(
    `SELECT o.status, COUNT(*)::int AS n FROM outbox o
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY o.status`,
    values
  );
  const counts = Object.fromEntries(OUTBOX_STATUSES.map((s) => [s, 0])) as Record<OutboxStatus, number>;
  for (const r of countRows) counts[r.status] = r.n;

  if (filters.status) {
    values.push(filters.status);
    where.push(`o.status = $${values.length}`);
  }
  const total = filters.status ? counts[filters.status] : OUTBOX_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  values.push(filters.limit, (filters.page - 1) * filters.limit);
  const { rows: messages } = await pool.query(
    `SELECT o.id::text AS id, o.channel, o.recipient,
            NULLIF(TRIM(CONCAT(u.name, ' ', u.surname)), '') AS recipient_name,
            o.subject, o.status, o.error, o.ticket_id, o.created_at, o.sent_at
     FROM outbox o
     LEFT JOIN users u ON u.user_id = o.user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return {
    messages,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
    counts,
  };
};
