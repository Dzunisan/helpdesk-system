/**
 * S14 attachments (docs/api-sprint-2.md "S14"). Upload first, then send the ids with the comment:
 * tickets.addComment(id, { body, attachment_ids }). Files never have public URLs: downloads go
 * through the API with the session cookie, which checks access every time.
 */
import { api, call } from "./apiClient";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  type AttachmentSummary,
  type UploadAttachmentsResponse,
} from "@/types/api";

/** The browser's own check before uploading (the server checks the real type again). Null = fine. */
export function attachmentProblem(files: File[]): string | null {
  if (files.length > ATTACHMENT_MAX_FILES) return `Attach at most ${ATTACHMENT_MAX_FILES} files.`;
  for (const file of files) {
    if (file.size > ATTACHMENT_MAX_BYTES) return `${file.name} is too large (max 5 MB).`;
    if (!(ATTACHMENT_ACCEPT as readonly string[]).includes(file.type)) return `${file.name} isn't a file type we accept.`;
  }
  return null;
}

/** POST /api/tickets/:id/attachments (multipart "files"): 413 "Too large (max 5 MB)", 400 wrong type */
export const uploadAttachments = async (
  ticketId: number,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<AttachmentSummary[]> => {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return (
    await call(
      () =>
        api.post<UploadAttachmentsResponse>(`/tickets/${ticketId}/attachments`, form, {
          onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
        }),
      "Couldn't upload the file.",
    )
  ).attachments;
};

/** Address of the file itself (use in an <a href> or <img src>; the cookie goes along) */
export const attachmentUrl = (attachmentId: number) => `${import.meta.env.VITE_API_URL}/api/attachments/${attachmentId}`;

/** Address of an image's small preview */
export const attachmentThumbUrl = (attachmentId: number) =>
  `${import.meta.env.VITE_API_URL}/api/attachments/${attachmentId}/thumb`;

/** DELETE /api/attachments/:id: the uploader, within 15 minutes */
export const deleteAttachment = (attachmentId: number) =>
  call(() => api.delete<{ message: string }>(`/attachments/${attachmentId}`), "Couldn't remove the file.");
