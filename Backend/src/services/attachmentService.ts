// S14 Attachments (briefing p.21). Contract: docs/api-sprint-2.md "S14".
//   - Bytes live in Postgres (attachment_blob), never on the server disk or paid storage.
//   - The real type comes from the file's first bytes, never from its name or the browser's
//     Content-Type: a renamed .exe is refused.
//   - Every download checks the ticket rules (ticketAccess.canView) again; there are no public URLs.
//     Internal files only ever reach staff of the ticket's department (404 for anyone else).
//   - File names are data: stored as typed (minus paths and control characters), sent back as JSON
//     strings or in an RFC 5987 Content-Disposition header, never as HTML.
// Linking uploads to a comment and listing them on the timeline: extensions/commentAttachments.ts.
import { pool, withTransaction } from "../config/database";
import { HttpError } from "../utils/httpError";
import { logEvent } from "./events";
import { canView, canWork, isRequester, loadTicketAccess, TICKET_NOT_FOUND } from "./ticketAccess";
import { FINAL_STATUSES, type TicketStatus } from "../types/ticket.types";
import type { User } from "../types/user.types";
import { MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentSummary } from "./extensions/commentAttachments";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = MAX_ATTACHMENTS_PER_MESSAGE;
export const TOO_LARGE_MESSAGE = "Too large (max 5 MB)";
export const ATTACHMENT_NOT_FOUND = "File not found.";
/** The uploader may remove a file for this long (soft delete) */
export const ATTACHMENT_DELETE_WINDOW_MINUTES = 15;

const MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  text: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** Same list as ATTACHMENT_ACCEPT in Frontend/src/types/api.ts */
export const ALLOWED_MIME_TYPES: string[] = Object.values(MIME);

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Plain text: valid UTF-8 with no NUL or other binary control bytes (an .exe always has NULs) */
const looksLikeText = (data: Buffer): boolean => {
  for (const byte of data) {
    if (byte === 9 || byte === 10 || byte === 13 || byte === 12) continue;
    if (byte < 32 || byte === 127) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
};

/**
 * The real type of a file from its first bytes (magic numbers), or null when it isn't one we take.
 * DOCX and XLSX are ZIP files: the entry names inside tell them apart from any other ZIP.
 */
export const detectFileType = (data: Buffer, fileName: string): string | null => {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (startsWith(data, [0xff, 0xd8, 0xff])) return MIME.jpeg;
  if (startsWith(data, ascii("GIF87a")) || startsWith(data, ascii("GIF89a"))) return MIME.gif;
  if (startsWith(data, ascii("RIFF")) && startsWith(data, ascii("WEBP"), 8)) return MIME.webp;
  if (startsWith(data, ascii("%PDF-"))) return MIME.pdf;
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    const names = data.toString("latin1");
    if (!names.includes("[Content_Types].xml")) return null;
    if (names.includes("word/")) return MIME.docx;
    if (names.includes("xl/")) return MIME.xlsx;
    return null;
  }
  if (looksLikeText(data)) return /\.csv$/i.test(fileName) ? MIME.csv : MIME.text;
  return null;
};

/**
 * The name as the person typed it, safe to store: no folders (C:\fakepath\..., ../), no control
 * characters, at most 255 characters. "<img onerror>.png" stays exactly that: it is only ever data.
 */
export const cleanFileName = (raw: string): string => {
  let name = String(raw ?? "");
  // busboy reads header parameters as latin1; recover UTF-8 names ("Résumé.pdf")
  if (/[\u0080-\u00ff]/.test(name)) {
    const utf8 = Buffer.from(name, "latin1").toString("utf8");
    if (!utf8.includes("\ufffd")) name = utf8;
  }
  name = name.split(/[\\/]/).pop() ?? "";
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (name === "" || name === "." || name === "..") name = "file";
  return name.length > 255 ? name.slice(name.length - 255) : name;
};

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const toSummary = (row: any): AttachmentSummary => ({ ...row, created_at: new Date(row.created_at).toISOString() });

interface TicketForUpload {
  ticket_id: number;
  requester_id: string;
  ticket_department_id: number;
  ticket_status: TicketStatus;
}

/**
 * The checks before any bytes are read: 404 when the caller can't see (and so can't comment on)
 * the ticket, 403 an internal file from someone who isn't staff, 400 a final ticket.
 */
export const checkCanUpload = async (ticketId: number, user: User, isInternal: boolean): Promise<void> => {
  const { rows } = await pool.query<TicketForUpload>(
    `SELECT ticket_id, requester_id::text AS requester_id, ticket_department_id, ticket_status
     FROM ticket WHERE ticket_id = $1 AND deleted_at IS NULL`,
    [ticketId]
  );
  const ticket = rows[0];
  if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
  const access = await loadTicketAccess(user);
  if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
  if (isInternal && !canWork(access, ticket)) {
    throw new HttpError(403, "Only agents and leads of this ticket's department can attach internal files.");
  }
  if (FINAL_STATUSES.includes(ticket.ticket_status)) {
    throw new HttpError(
      400,
      ticket.ticket_status === "Cancelled"
        ? "This request was cancelled. Start a new request."
        : "This ticket is closed. Start a new request."
    );
  }
};

/**
 * POST /api/tickets/:id/attachments: stores each file (bytes in attachment_blob) unsent
 * (comment_id NULL) and writes one `attached` event per file, all in one transaction.
 * The event is staff-only when a staff member uploads: until the file is sent we don't know whether
 * it goes with a public reply or an internal note, and its name must never reach the requester
 * through the timeline if it ends up internal. The requester's own uploads are public events.
 */
export const uploadAttachments = async (
  ticketId: number,
  user: User,
  files: UploadFile[],
  isInternal: boolean
): Promise<AttachmentSummary[]> => {
  if (files.length === 0) throw new HttpError(400, "Choose a file to attach.");
  if (files.length > ATTACHMENT_MAX_FILES) {
    throw new HttpError(400, `Attach at most ${ATTACHMENT_MAX_FILES} files to one message.`);
  }
  const prepared = files.map((file) => {
    const fileName = cleanFileName(file.originalname);
    if (file.size > ATTACHMENT_MAX_BYTES || file.buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new HttpError(413, TOO_LARGE_MESSAGE);
    }
    if (file.buffer.length === 0) throw new HttpError(400, `${fileName} is empty.`);
    const mimeType = detectFileType(file.buffer, fileName);
    if (!mimeType) {
      throw new HttpError(400, `${fileName} isn't a file type we accept. Use PNG, JPG, GIF, WebP, PDF, TXT, CSV, DOCX or XLSX.`);
    }
    return { fileName, mimeType, data: file.buffer };
  });

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ticket_id, requester_id::text AS requester_id, ticket_department_id, ticket_status
       FROM ticket WHERE ticket_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [ticketId]
    );
    const ticket = rows[0] as TicketForUpload | undefined;
    if (!ticket) throw new HttpError(404, TICKET_NOT_FOUND);
    const access = await loadTicketAccess(user);
    if (!canView(access, ticket)) throw new HttpError(404, TICKET_NOT_FOUND);
    const staff = canWork(access, ticket);
    if (isInternal && !staff) {
      throw new HttpError(403, "Only agents and leads of this ticket's department can attach internal files.");
    }
    if (FINAL_STATUSES.includes(ticket.ticket_status)) throw new HttpError(400, "This ticket is closed. Start a new request.");

    const saved: AttachmentSummary[] = [];
    for (const file of prepared) {
      const inserted = await client.query(
        `INSERT INTO attachment (ticket_id, uploader_id, file_name, mime_type, size_bytes, is_internal)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING attachment_id, comment_id, file_name, mime_type, size_bytes, is_internal,
                   mime_type LIKE 'image/%' AS is_image, uploader_id::text AS uploader_id, created_at`,
        [ticketId, user.user_id, file.fileName, file.mimeType, file.data.length, isInternal]
      );
      const attachment = toSummary(inserted.rows[0]);
      // thumb stays NULL: images are their own preview (GET /:id/thumb), no image library needed
      await client.query(`INSERT INTO attachment_blob (attachment_id, data) VALUES ($1, $2)`, [
        attachment.attachment_id,
        file.data,
      ]);
      await logEvent(client, {
        ticketId,
        actorId: user.user_id,
        type: "attached",
        to: String(attachment.attachment_id),
        note: file.fileName,
        isInternal: isInternal || (staff && !isRequester(access, ticket)),
      });
      saved.push(attachment);
    }
    await client.query(`UPDATE ticket SET updated_at = now() WHERE ticket_id = $1`, [ticketId]);
    return saved;
  });
};

interface AttachmentRow {
  attachment_id: number;
  ticket_id: number;
  comment_id: number | null;
  uploader_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_internal: boolean;
  deleted_at: Date | null;
  created_at: Date;
  comment_deleted: boolean;
  requester_id: string;
  ticket_department_id: number;
  ticket_status: TicketStatus;
}

/**
 * The attachment if this user may see it, else 404 "File not found." (never admits it exists):
 *   - canView on the ticket (another department's agent: 404)
 *   - internal files: staff of the ticket's department only (an employee never gets one)
 *   - not yet sent with a message: the uploader and department staff only
 *   - removed (or its message removed): staff only for a removed message, nobody for a removed file
 */
const visibleAttachment = async (attachmentId: number, user: User) => {
  const { rows } = await pool.query<AttachmentRow>(
    `SELECT a.attachment_id, a.ticket_id, a.comment_id, a.uploader_id::text AS uploader_id, a.file_name,
            a.mime_type, a.size_bytes, a.is_internal, a.deleted_at, a.created_at,
            (c.deleted_at IS NOT NULL) AS comment_deleted,
            t.requester_id::text AS requester_id, t.ticket_department_id, t.ticket_status
     FROM attachment a
     JOIN ticket t ON t.ticket_id = a.ticket_id AND t.deleted_at IS NULL
     LEFT JOIN comment c ON c.comment_id = a.comment_id
     WHERE a.attachment_id = $1`,
    [attachmentId]
  );
  const row = rows[0];
  if (!row || row.deleted_at) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  const access = await loadTicketAccess(user);
  if (!canView(access, row)) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  const staff = canWork(access, row);
  const uploader = String(row.uploader_id) === String(user.user_id);
  if (row.is_internal && !staff) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  if (row.comment_id === null && !staff && !uploader) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  if (row.comment_deleted && !staff) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  return { row, staff, uploader };
};

export interface AttachmentFile {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data: Buffer;
}

/** GET /api/attachments/:id: the bytes, after the access checks above */
export const getAttachmentFile = async (attachmentId: number, user: User): Promise<AttachmentFile> => {
  const { row } = await visibleAttachment(attachmentId, user);
  const { rows } = await pool.query<{ data: Buffer }>(`SELECT data FROM attachment_blob WHERE attachment_id = $1`, [
    attachmentId,
  ]);
  if (!rows[0]) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  return { file_name: row.file_name, mime_type: row.mime_type, size_bytes: row.size_bytes, data: rows[0].data };
};

/** GET /api/attachments/:id/thumb: the stored thumbnail, or the image itself; 404 for non-images */
export const getAttachmentThumb = async (attachmentId: number, user: User): Promise<AttachmentFile> => {
  const { row } = await visibleAttachment(attachmentId, user);
  if (!row.mime_type.startsWith("image/")) throw new HttpError(404, "There's no preview for this file.");
  const { rows } = await pool.query<{ data: Buffer; thumb: Buffer | null }>(
    `SELECT CASE WHEN thumb IS NULL THEN data END AS data, thumb FROM attachment_blob WHERE attachment_id = $1`,
    [attachmentId]
  );
  if (!rows[0]) throw new HttpError(404, ATTACHMENT_NOT_FOUND);
  const data = rows[0].thumb ?? rows[0].data;
  return { file_name: row.file_name, mime_type: rows[0].thumb ? "image/png" : row.mime_type, size_bytes: data.length, data };
};

/**
 * DELETE /api/attachments/:id: the uploader only (403 anyone else who can see it), within 15 minutes
 * of uploading (403 after), soft (deleted_at). The bytes stay until a clean-up job removes them.
 */
export const deleteAttachment = async (attachmentId: number, user: User): Promise<void> => {
  const { row, uploader } = await visibleAttachment(attachmentId, user);
  if (!uploader) throw new HttpError(403, "Only the person who attached this file can remove it.");
  if (FINAL_STATUSES.includes(row.ticket_status)) throw new HttpError(409, "This ticket is closed. Files can't be removed any more.");
  if (Date.now() - new Date(row.created_at).getTime() > ATTACHMENT_DELETE_WINDOW_MINUTES * 60_000) {
    throw new HttpError(403, `Files can only be removed within ${ATTACHMENT_DELETE_WINDOW_MINUTES} minutes of attaching them.`);
  }
  await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE attachment SET deleted_at = now()
       WHERE attachment_id = $1 AND deleted_at IS NULL AND uploader_id = $2
         AND created_at > now() - make_interval(mins => $3::int)`,
      [attachmentId, user.user_id, ATTACHMENT_DELETE_WINDOW_MINUTES]
    );
    if (!result.rowCount) throw new HttpError(403, "This file can't be removed any more.");
    // Same audience as the file's `attached` event, so an internal file's name never leaks
    const attached = await client.query<{ is_internal: boolean }>(
      `SELECT is_internal FROM ticket_event
       WHERE ticket_id = $1 AND type = 'attached' AND to_value = $2
       ORDER BY created_at DESC LIMIT 1`,
      [row.ticket_id, String(attachmentId)]
    );
    await logEvent(client, {
      ticketId: row.ticket_id,
      actorId: user.user_id,
      type: "attachment_removed",
      to: String(attachmentId),
      note: row.file_name,
      isInternal: row.is_internal || (attached.rows[0]?.is_internal ?? true),
    });
    await client.query(`UPDATE ticket SET updated_at = now() WHERE ticket_id = $1`, [row.ticket_id]);
  });
};
