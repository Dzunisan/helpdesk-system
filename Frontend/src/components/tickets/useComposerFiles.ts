import { useCallback, useEffect, useRef, useState } from "react";
import { deleteAttachment } from "@/services/attachments";
import { toApiError } from "@/services/apiClient";
import type { AttachmentSummary } from "@/types/api";
import { fileProblem, isImageFile, uploadOne, uploadProblem } from "./attachmentUpload";

export interface ComposerFile {
  key: string;
  file: File;
  /** Object URL for an image's thumbnail */
  previewUrl: string | null;
  status: "uploading" | "done" | "error";
  progress: number;
  error: string | null;
  attachment: AttachmentSummary | null;
  /** Staff: only staff can see this file */
  internal: boolean;
}

let counter = 0;

/**
 * The composer's files (S14): each uploads as soon as it's added (progress per file), a refused file
 * keeps its plain-word error so the rest can still be sent. Changing a file's Internal flag uploads
 * it again with the new flag (the old upload is removed).
 */
export function useComposerFiles(ticketId: number) {
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, change: Partial<ComposerFile>) => {
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));
  }, []);

  const start = useCallback(
    async (key: string, file: File, internal: boolean) => {
      controllers.current.get(key)?.abort();
      const controller = new AbortController();
      controllers.current.set(key, controller);
      patch(key, { status: "uploading", progress: 0, error: null, attachment: null, internal });
      try {
        const attachment = await uploadOne(ticketId, file, internal, (progress) => patch(key, { progress }), controller.signal);
        if (controller.signal.aborted) return;
        patch(key, { status: "done", progress: 100, attachment });
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = toApiError(err);
        patch(key, { status: "error", error: uploadProblem(error.status, error.message) });
      } finally {
        if (controllers.current.get(key) === controller) controllers.current.delete(key);
      }
    },
    [patch, ticketId],
  );

  const add = useCallback(
    (incoming: Iterable<File>, internal: boolean) => {
      let queued = filesRef.current.filter((f) => f.status !== "error").length;
      const added: ComposerFile[] = [];
      for (const file of incoming) {
        const problem = fileProblem(file, queued);
        const key = `f${++counter}`;
        added.push({
          key,
          file,
          previewUrl: !problem && isImageFile(file) ? URL.createObjectURL(file) : null,
          status: problem ? "error" : "uploading",
          progress: 0,
          error: problem,
          attachment: null,
          internal,
        });
        if (!problem) queued += 1;
      }
      setFiles((list) => [...list, ...added]);
      for (const f of added) if (!f.error) void start(f.key, f.file, internal);
    },
    [start],
  );

  const forget = (f: ComposerFile) => {
    controllers.current.get(f.key)?.abort();
    controllers.current.delete(f.key);
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  };

  const remove = useCallback((key: string) => {
    const f = filesRef.current.find((x) => x.key === key);
    if (!f) return;
    forget(f);
    // An unsent upload is removed on the server too (best effort: it's never linked anyway)
    if (f.attachment) void deleteAttachment(f.attachment.attachment_id).catch(() => undefined);
    setFiles((list) => list.filter((x) => x.key !== key));
  }, []);

  const setInternal = useCallback(
    (key: string, internal: boolean) => {
      const f = filesRef.current.find((x) => x.key === key);
      if (!f || f.internal === internal) return;
      if (f.status === "error") return patch(key, { internal });
      if (f.attachment) void deleteAttachment(f.attachment.attachment_id).catch(() => undefined);
      void start(key, f.file, internal);
    },
    [patch, start],
  );

  /** After sending: the files now belong to the message */
  const clear = useCallback(() => {
    for (const f of filesRef.current) forget(f);
    setFiles([]);
  }, []);

  useEffect(
    () => () => {
      for (const f of filesRef.current) forget(f);
    },
    [],
  );

  const uploadedIds = files.filter((f) => f.status === "done" && f.attachment).map((f) => f.attachment!.attachment_id);
  const uploading = files.some((f) => f.status === "uploading");
  return { files, add, remove, setInternal, clear, uploadedIds, uploading };
}

