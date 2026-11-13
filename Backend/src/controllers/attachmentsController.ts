// S14 Attachments (briefing p.21). Contract: docs/api-sprint-2.md "S14". POST
// /api/tickets/:id/attachments is wired in routes/ticketRoutes.ts, the rest in
// routes/attachmentRoutes.ts. The rules live in services/attachmentService.ts; linking files to a
// comment and listing them on the timeline is in services/extensions/commentAttachments.ts.
import { Request, Response } from "express";
import multer from "multer";
import * as attachments from "../services/attachmentService";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

// Memory storage: the bytes go straight into attachment_blob, never onto the server's disk
const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: attachments.ATTACHMENT_MAX_BYTES,
    files: attachments.ATTACHMENT_MAX_FILES,
    fields: 10,
    fieldSize: 1024,
    parts: attachments.ATTACHMENT_MAX_FILES + 10,
  },
}).any();

const runMulter = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) => {
    parseUpload(req, res, (error: unknown) => {
      if (!error) return resolve();
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") return reject(new HttpError(413, attachments.TOO_LARGE_MESSAGE));
        if (error.code === "LIMIT_FILE_COUNT") {
          return reject(new HttpError(400, `Attach at most ${attachments.ATTACHMENT_MAX_FILES} files to one message.`));
        }
        return reject(new HttpError(400, "The upload couldn't be read. Choose the files again."));
      }
      return reject(new HttpError(400, "The upload couldn't be read. Choose the files again."));
    });
  });

const isTrue = (value: unknown) => ["true", "1", "on"].includes(String(Array.isArray(value) ? value[0] : value ?? "").toLowerCase());

/** POST /api/tickets/:id/attachments (multipart "files", <= 5 MB each, <= 5) -> 201 { attachments } */
export const uploadAttachments = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const ticketId = parseIntId(req.params.id);
    // Who may upload is checked before a single byte is read (404 other department, final ticket)
    await attachments.checkCanUpload(ticketId, user, isTrue(req.query.is_internal));
    if (!req.is("multipart/form-data")) throw new HttpError(400, "Send the files as multipart/form-data in \"files\".");
    await runMulter(req, res);
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).filter((f) =>
      ["files", "files[]", "file"].includes(f.fieldname)
    );
    const isInternal = isTrue(req.body?.is_internal) || isTrue(req.query.is_internal);
    const saved = await attachments.uploadAttachments(ticketId, user, files, isInternal);
    return res.status(201).json({ message: saved.length === 1 ? "File attached." : "Files attached.", attachments: saved });
  } catch (error) {
    return sendError(res, error, "Attachment upload error");
  }
};

/**
 * Sends a stored file. The name only ever travels as a header parameter (RFC 5987, plus an ASCII
 * fallback with quotes and backslashes removed); nosniff + a sandboxing CSP stop a browser from
 * treating any file as a page.
 */
const sendFile = (res: Response, file: attachments.AttachmentFile, disposition: "attachment" | "inline") => {
  const fallback = file.file_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(file.file_name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const type = file.mime_type.startsWith("text/") ? `${file.mime_type}; charset=utf-8` : file.mime_type;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", String(file.data.length));
  res.setHeader("Content-Disposition", `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).end(file.data);
};

/** GET /api/attachments/:id -> the file (canView + internal check) */
export const downloadAttachment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const file = await attachments.getAttachmentFile(parseIntId(req.params.id, "attachment"), user);
    return sendFile(res, file, "attachment");
  } catch (error) {
    return sendError(res, error, "Attachment download error");
  }
};

/** GET /api/attachments/:id/thumb -> small image preview */
export const attachmentThumb = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const file = await attachments.getAttachmentThumb(parseIntId(req.params.id, "attachment"), user);
    return sendFile(res, file, "inline");
  } catch (error) {
    return sendError(res, error, "Attachment preview error");
  }
};

/** DELETE /api/attachments/:id (uploader within 15 minutes, soft delete) */
export const deleteAttachment = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    await attachments.deleteAttachment(parseIntId(req.params.id, "attachment"), user);
    return res.status(200).json({ message: "File removed." });
  } catch (error) {
    return sendError(res, error, "Attachment delete error");
  }
};
