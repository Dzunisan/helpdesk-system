// EXTENSION POINT: S14 attachments (briefing p.21). Owned by the attachments feature; the core code
// calls:
//   linkAttachments()          from addComment (services/ticketTimeline.ts) when POST
//                              /api/tickets/:id/comments carries attachment_ids, AFTER the comment
//                              row is written, inside the comment's transaction
//   loadCommentAttachments()   from getTimeline, to put `attachments` on every comment item
//
// Files are uploaded first (POST /api/tickets/:id/attachments -> ids, comment_id NULL), then sent
// with the comment. A file sent with an internal note becomes internal, and a file uploaded as
// internal (staff, is_internal=true) stays internal even on a public reply; employees never receive
// internal attachments (the timeline filter below and canView on download).
import { pool } from "../../config/database";
import { HttpError } from "../../utils/httpError";
import type { CommentContext } from "./commentContext";

/** At most this many files per message (p.21) */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export interface AttachmentSummary {
  attachment_id: number;
  comment_id: number | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_internal: boolean;
  /** Images get a thumbnail: GET /api/attachments/:id/thumb */
  is_image: boolean;
  uploader_id: string;
  created_at: string;
}

/**
 * Links the caller's own unsent uploads on this ticket to the new comment. 400 when any id isn't
 * one of them (someone else's file, another ticket's, already sent, deleted) or there are too many.
 */
export const linkAttachments = async (ctx: CommentContext, commentId: number, attachmentIds: number[]): Promise<void> => {
  const ids = [...new Set(attachmentIds)];
  if (ids.length === 0) return;
  if (ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new HttpError(400, `Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message.`);
  }
  const result = await ctx.client.query(
    `UPDATE attachment
     SET comment_id = $1, is_internal = (is_internal OR $2)
     WHERE attachment_id = ANY($3::int[])
       AND ticket_id = $4 AND uploader_id = $5
       AND comment_id IS NULL AND deleted_at IS NULL`,
    [commentId, ctx.isInternal, ids, ctx.ticket.ticket_id, ctx.user.user_id]
  );
  if (result.rowCount !== ids.length) {
    throw new HttpError(400, "One of the files can't be attached. Upload it again.");
  }
};

/** Attachments of these comments, grouped by comment id. includeInternal = the viewer is staff. */
export const loadCommentAttachments = async (
  commentIds: number[],
  includeInternal: boolean
): Promise<Map<number, AttachmentSummary[]>> => {
  const byComment = new Map<number, AttachmentSummary[]>();
  if (commentIds.length === 0) return byComment;
  const { rows } = await pool.query<AttachmentSummary>(
    `SELECT a.attachment_id, a.comment_id, a.file_name, a.mime_type, a.size_bytes, a.is_internal,
            a.mime_type LIKE 'image/%' AS is_image, a.uploader_id::text AS uploader_id, a.created_at
     FROM attachment a
     WHERE a.comment_id = ANY($1::int[]) AND a.deleted_at IS NULL ${includeInternal ? "" : "AND NOT a.is_internal"}
     ORDER BY a.attachment_id`,
    [commentIds]
  );
  for (const row of rows) {
    const list = byComment.get(row.comment_id!) ?? [];
    list.push({ ...row, created_at: new Date(row.created_at).toISOString() });
    byComment.set(row.comment_id!, list);
  }
  return byComment;
};
