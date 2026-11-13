import { useState } from "react";
import { FileText, ImageOff, Lock, Paperclip } from "lucide-react";
import { attachmentThumbUrl, attachmentUrl } from "@/services/attachments";
import type { AttachmentSummary } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes } from "./attachmentUpload";

/**
 * Files on a message (S14, briefing p.21, p.41-42, p.48): images as thumbnails, the rest as chips.
 * Every link goes through the API with the session cookie, which checks access each time; file
 * names are only ever text. `showInternal` marks staff-only files (staff views).
 */
export default function TimelineAttachments({ files, showInternal }: { files: AttachmentSummary[]; showInternal: boolean }) {
  if (files.length === 0) return null;
  const images = files.filter((f) => f.is_image);
  const others = files.filter((f) => !f.is_image);
  return (
    <div className="flex flex-col gap-2 pt-1">
      {images.length > 0 && (
        <ul aria-label="Images" className="flex flex-wrap gap-3">
          {images.map((f) => (
            <li key={f.attachment_id}>
              <Thumbnail file={f} internal={showInternal && f.is_internal} />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul aria-label="Files" className="flex flex-wrap gap-2">
          {others.map((f) => (
            <li key={f.attachment_id}>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 max-w-full gap-1.5 bg-background font-normal",
                  showInternal && f.is_internal && "border-warning-border bg-warning-muted hover:bg-warning-subtle",
                )}
              >
                <a href={attachmentUrl(f.attachment_id)} target="_blank" rel="noopener noreferrer" title={`Download ${f.file_name}`}>
                  {showInternal && f.is_internal ? (
                    <Lock data-icon="inline-start" className="text-warning" aria-label="Internal" />
                  ) : f.mime_type === "application/pdf" ? (
                    <FileText data-icon="inline-start" className="text-muted-foreground" />
                  ) : (
                    <Paperclip data-icon="inline-start" className="text-muted-foreground" />
                  )}
                  <span className="truncate text-foreground">{f.file_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">· {formatBytes(f.size_bytes)}</span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumbnail({ file, internal }: { file: AttachmentSummary; internal: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={attachmentUrl(file.attachment_id)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group flex w-44 flex-col overflow-hidden rounded-lg border bg-background outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:w-52",
            internal ? "border-warning-border" : "border-border",
          )}
        >
          <span className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-muted">
            {broken ? (
              <ImageOff className="size-5 text-muted-foreground" aria-hidden />
            ) : (
              <img
                src={attachmentThumbUrl(file.attachment_id)}
                alt={file.file_name}
                loading="lazy"
                onError={() => setBroken(true)}
                className="size-full object-cover transition-transform group-hover:scale-[1.02]"
              />
            )}
            {internal && (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                <Lock className="size-2.5" aria-hidden />
                Internal
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-baseline gap-1 px-2.5 py-1.5 text-xs">
            <span className="truncate text-foreground">{file.file_name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">· {formatBytes(file.size_bytes)}</span>
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent>Open {file.file_name}</TooltipContent>
    </Tooltip>
  );
}
