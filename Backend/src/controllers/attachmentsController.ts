// S14 Attachments (briefing p.21). OWNER: the attachments feature. Contract: docs/api-sprint-2.md
// "S14". POST /api/tickets/:id/attachments is wired in routes/ticketRoutes.ts, the rest in
// routes/attachmentRoutes.ts. Linking files to a comment and listing them on the timeline is in
// services/extensions/commentAttachments.ts.
import { notImplemented } from "../utils/notImplemented";

/** POST /api/tickets/:id/attachments (multipart "files", <= 5 MB each, <= 5) -> 201 { attachments } */
export const uploadAttachments = notImplemented("S14 POST /api/tickets/:id/attachments");

/** GET /api/attachments/:id -> the file (canView + internal check) */
export const downloadAttachment = notImplemented("S14 GET /api/attachments/:id");

/** GET /api/attachments/:id/thumb -> small image preview */
export const attachmentThumb = notImplemented("S14 GET /api/attachments/:id/thumb");

/** DELETE /api/attachments/:id (uploader within 15 minutes, soft delete) */
export const deleteAttachment = notImplemented("S14 DELETE /api/attachments/:id");
