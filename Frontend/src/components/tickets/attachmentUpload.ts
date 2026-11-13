import { uploadAttachments } from "@/services/attachments";
import { ACCEPT_WORDS, formatBytes } from "@/components/request/attachmentRules";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, type AttachmentSummary } from "@/types/api";

/*
 * S14 in the composer (briefing p.21, p.42, p.49): every file uploads on its own, so each one gets
 * its own progress bar, its own plain-word error and (staff) its own Internal flag. The browser
 * checks type and size first so mistakes show at once; the server checks the real type again.
 */

// One list of types and one size format for the new request form and the composer
export { ACCEPT_ATTRIBUTE, ACCEPT_WORDS, formatBytes } from "@/components/request/attachmentRules";
/** Some browsers leave `type` empty for .docx/.csv: fall back to the extension */
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const extensionOf = (file: File) => (file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "");
const typeOf = (file: File) => file.type || EXTENSION_TYPES[extensionOf(file)] || "";

export const isImageFile = (file: File) => typeOf(file).startsWith("image/");

/** Why this file can't go, in plain words ("Too large: 48 MB. The limit is 5 MB per file."), or null */
export function fileProblem(file: File, alreadyQueued: number): string | null {
  if (alreadyQueued >= ATTACHMENT_MAX_FILES) return `Only ${ATTACHMENT_MAX_FILES} files per message. Remove one to add this.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `Too large: ${formatBytes(file.size)}. The limit is 5 MB per file.`;
  // The extension must be one we take too: the server refuses "fix.bat" even though it is plain text
  if (!EXTENSION_TYPES[extensionOf(file)] || !(ATTACHMENT_ACCEPT as readonly string[]).includes(typeOf(file)))
    return `This file type isn't allowed. Use ${ACCEPT_WORDS}.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** The server's words for an upload it refused, made plain */
export function uploadProblem(status: number, message: string): string {
  if (status === 413) return "Too large. The limit is 5 MB per file.";
  if (status === 400 && /type/i.test(message)) return `This file type isn't allowed. Use ${ACCEPT_WORDS}.`;
  if (status === 0) return "Couldn't reach the server. Remove it and try again.";
  return message || "Couldn't upload this file.";
}

/**
 * POST /api/tickets/:id/attachments with one file and its Internal flag (staff only). The ids go
 * with the comment as attachment_ids.
 */
export async function uploadOne(
  ticketId: number,
  file: File,
  internal: boolean,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<AttachmentSummary> {
  const [attachment] = await uploadAttachments(ticketId, [file], onProgress, { isInternal: internal, signal });
  if (!attachment) throw new Error("The server didn't keep the file.");
  return attachment;
}
