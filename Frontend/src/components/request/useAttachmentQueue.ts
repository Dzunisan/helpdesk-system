import { useCallback, useEffect, useRef, useState } from "react";
import { deleteAttachment, uploadAttachments } from "@/services/attachments";
import { toApiError } from "@/services/apiClient";
import type { AttachmentSummary } from "@/types/api";
import { ATTACHMENT_MAX_FILES, fileProblem, isImageFile } from "./attachmentRules";

export type QueuedFileStatus = "ready" | "uploading" | "uploaded" | "failed" | "invalid";

export interface QueuedFile {
  key: string;
  file: File;
  /** A local preview for pictures (object URL), revoked when the file leaves the list */
  previewUrl: string | null;
  status: QueuedFileStatus;
  /** 0-100 while uploading */
  progress: number;
  /** Plain words: "Too large: 48 MB. The limit is 5 MB per file." */
  error: string | null;
  /** The server's record once uploaded */
  attachment: AttachmentSummary | null;
}

interface Options {
  /**
   * The ticket the files belong to. Given (reply composer): each file uploads as soon as it is
   * added, with its own progress bar. Not given (new request): files wait for uploadAll(newId).
   */
  ticketId?: number;
}

let counter = 0;
const nextKey = () => `f${Date.now().toString(36)}-${(counter += 1)}`;

/**
 * The files in a drop zone (briefing p.42): checked in the browser first, one row each with a
 * thumbnail, size and progress bar; a bad file shows its own error so the rest can still be sent.
 */
export function useAttachmentQueue({ ticketId }: Options = {}) {
  const [items, setItems] = useState<QueuedFile[]>([]);
  // The latest list for callbacks (add, remove, uploadAll) without re-creating them on every change
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((key: string, change: Partial<QueuedFile>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const uploadOne = useCallback(
    async (item: QueuedFile, target: number): Promise<AttachmentSummary | null> => {
      patch(item.key, { status: "uploading", progress: 0, error: null });
      try {
        const [attachment] = await uploadAttachments(target, [item.file], (progress) =>
          patch(item.key, { progress: Math.min(progress, 99) }),
        );
        patch(item.key, { status: "uploaded", progress: 100, attachment: attachment ?? null });
        return attachment ?? null;
      } catch (error) {
        const apiError = toApiError(error, "Couldn't upload the file.");
        const message =
          apiError.status === 413
            ? `Too large: ${Math.round(item.file.size / 1024 / 1024)} MB. The limit is 5 MB per file.`
            : apiError.status === 501
              ? "File uploads aren't switched on yet. Describe it in words for now."
              : apiError.message;
        patch(item.key, { status: "failed", progress: 0, error: message });
        return null;
      }
    },
    [patch],
  );

  const add = useCallback(
    (files: File[]) => {
      let room = ATTACHMENT_MAX_FILES - itemsRef.current.filter((item) => item.status !== "invalid").length;
      const added: QueuedFile[] = files.map((file) => {
        let error = fileProblem(file);
        if (!error && room <= 0) error = `Only ${ATTACHMENT_MAX_FILES} files per message. Send the rest separately.`;
        if (!error) room -= 1;
        return {
          key: nextKey(),
          file,
          previewUrl: !error && isImageFile(file) ? URL.createObjectURL(file) : null,
          status: error ? "invalid" : "ready",
          progress: 0,
          error,
          attachment: null,
        };
      });
      setItems((current) => [...current, ...added]);
      if (ticketId) for (const item of added) if (item.status === "ready") void uploadOne(item, ticketId);
    },
    [ticketId, uploadOne],
  );

  const forget = (item: QueuedFile | undefined) => {
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  };

  /** Takes a file out; an uploaded (unsent) one is deleted on the server too (allowed for 15 minutes) */
  const remove = useCallback((key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    forget(item);
    setItems((current) => current.filter((i) => i.key !== key));
    if (item?.attachment) void deleteAttachment(item.attachment.attachment_id).catch(() => undefined);
  }, []);

  /** Tries a failed upload again */
  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item && ticketId && item.status === "failed") void uploadOne(item, ticketId);
    },
    [ticketId, uploadOne],
  );

  /** Empties the list after the message went out (the files now belong to it) */
  const clear = useCallback(() => {
    itemsRef.current.forEach(forget);
    setItems([]);
  }, []);

  /** New request: upload every waiting file to the ticket just created, one after another */
  const uploadAll = useCallback(
    async (target: number) => {
      const uploaded: AttachmentSummary[] = [];
      const failed: QueuedFile[] = [];
      for (const item of itemsRef.current) {
        if (item.status !== "ready" && item.status !== "failed") continue;
        const attachment = await uploadOne(item, target);
        if (attachment) uploaded.push(attachment);
        else failed.push(item);
      }
      return { uploaded, failed };
    },
    [uploadOne],
  );

  // Previews are revoked when the composer goes away
  useEffect(() => () => itemsRef.current.forEach(forget), []);

  const uploading = items.some((item) => item.status === "uploading");
  const uploadedIds = items.flatMap((item) => (item.status === "uploaded" && item.attachment ? [item.attachment.attachment_id] : []));
  const sendable = items.filter((item) => item.status === "ready" || item.status === "uploaded").length;

  return { items, add, remove, retry, clear, uploadAll, uploading, uploadedIds, sendable };
}

export type AttachmentQueue = ReturnType<typeof useAttachmentQueue>;
