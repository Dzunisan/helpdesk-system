/**
 * The browser's own checks on a file before it uploads (briefing p.21, p.42): type and size first,
 * so a mistake shows at once and in plain words. The server checks the real type again from the
 * file's first bytes, so a renamed .exe never gets through either way.
 */
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES } from "@/types/api";

export { ATTACHMENT_MAX_FILES };

/** Extensions we accept, matched with ATTACHMENT_ACCEPT (some browsers leave file.type empty for docx/csv) */
const EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "csv", "docx", "xlsx"] as const;

/** The file input's accept attribute: types and extensions, so the picker greys out the rest */
export const ACCEPT_ATTRIBUTE = [...ATTACHMENT_ACCEPT, ...EXTENSIONS.map((ext) => `.${ext}`)].join(",");

/** Short words for the drop zone hint: the same list the server accepts (attachmentService.ts) */
export const ACCEPT_WORDS = "png, jpg, gif, webp, pdf, txt, csv, docx, xlsx";

const MB = 1024 * 1024;

/** "96 KB", "2.1 MB", "312 bytes", "1 byte" */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
}

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** True for the types we show as a picture */
export const isImageFile = (file: Pick<File, "type" | "name">) =>
  file.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(extensionOf(file.name));

/** One file's problem in plain words, or null when it can go (p.42 "Too large: 48 MB. The limit is 5 MB per file.") */
export function fileProblem(file: File): string | null {
  const typeOk = (ATTACHMENT_ACCEPT as readonly string[]).includes(file.type);
  const extOk = (EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
  // The server wants a known extension that matches the bytes (a .bat or .hta is refused even
  // though it is plain text); some browsers leave file.type empty, so the extension decides then
  if (!extOk || (!typeOk && file.type !== "" && file.type !== "application/octet-stream")) {
    return `This file type isn't allowed. Use ${ACCEPT_WORDS}.`;
  }
  if (file.size > ATTACHMENT_MAX_BYTES) return `Too large: ${formatBytes(file.size)}. The limit is 5 MB per file.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}
