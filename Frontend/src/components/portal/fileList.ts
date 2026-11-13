import type { TimelineItem } from "@/types/api";

/** One file on the request, from a message's attachments or an "attached" timeline event */
export interface RequestFile {
  id: number;
  name: string;
  size: number | null;
  isImage: boolean;
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Every file the employee can see on the request, oldest first: the files sent with messages plus
 * files uploaded with the request itself (an `attached` event whose id no message carries).
 * The server already leaves out internal files for employees.
 */
export function filesOf(items: TimelineItem[] | null): RequestFile[] {
  if (!items) return [];
  const files = new Map<number, RequestFile>();
  for (const item of items) {
    if (item.kind === "comment") {
      if (item.deleted_at) continue;
      for (const a of item.attachments ?? []) {
        files.set(a.attachment_id, { id: a.attachment_id, name: a.file_name, size: a.size_bytes, isImage: a.is_image });
      }
    }
  }
  // S14: a file its uploader removed again (attachment_removed event) is gone
  const removed = new Set(
    items.flatMap((i) => (i.kind === "event" && i.type === "attachment_removed" ? [Number(i.to_value)] : [])),
  );
  for (const item of items) {
    if (item.kind !== "event" || item.type !== "attached" || item.is_internal) continue;
    const id = Number(item.to_value);
    if (!Number.isInteger(id) || files.has(id) || removed.has(id)) continue;
    const name = item.note ?? "File";
    files.set(id, { id, name, size: item.size_bytes ?? null, isImage: IMAGE_NAME.test(name) });
  }
  return [...files.values()];
}
