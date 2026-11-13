import { useId, useRef, useState, type DragEvent } from "react";
import { CircleAlert, CircleCheck, FileText, Paperclip, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE, ACCEPT_WORDS, ATTACHMENT_MAX_FILES, formatBytes } from "./attachmentRules";
import type { AttachmentQueue, QueuedFile } from "./useAttachmentQueue";

interface AttachmentDropZoneProps {
  queue: AttachmentQueue;
  /** "Attach a quote or screenshot" (new request) or "Drop files here" (reply) */
  label?: string;
  disabled?: boolean;
  /** Tighter rows inside the reply composer */
  compact?: boolean;
  className?: string;
}

/**
 * The attachments drop zone (briefing p.39, p.42, S14): drop or browse, then one row per file with
 * a thumbnail, its size and a progress bar. A bad file shows its own error in plain words and the
 * others still go.
 */
export default function AttachmentDropZone({ queue, label, disabled, compact, className }: AttachmentDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const full = queue.sendable >= ATTACHMENT_MAX_FILES;

  const take = (list: FileList | null) => {
    if (!list || list.length === 0 || disabled) return;
    queue.add(Array.from(list));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {queue.items.length > 0 && (
        <ul aria-label="Files" className="flex flex-col gap-2">
          {queue.items.map((item) => (
            <FileRow
              key={item.key}
              item={item}
              compact={compact}
              onRemove={() => queue.remove(item.key)}
              onRetry={() => queue.retry(item.key)}
            />
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 text-center text-sm transition-colors",
          compact ? "py-3" : "py-5",
          over ? "border-primary bg-primary/5 text-foreground" : "border-border bg-muted/30 text-muted-foreground",
          disabled && "opacity-60",
        )}
      >
        <span className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
          <Paperclip className="size-4 shrink-0" aria-hidden />
          <span>{label ?? "Drop files here or"}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm font-medium"
            disabled={disabled || full}
            onClick={() => inputRef.current?.click()}
          >
            browse
          </Button>
        </span>
        <span className="text-xs text-muted-foreground">
          {ACCEPT_WORDS} · up to 5 MB each · {ATTACHMENT_MAX_FILES} files
        </span>
        <Input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose files to attach"
          disabled={disabled || full}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function FileRow({ item, compact, onRemove, onRetry }: { item: QueuedFile; compact?: boolean; onRemove: () => void; onRetry: () => void }) {
  const bad = item.status === "invalid" || item.status === "failed";
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3",
        compact ? "py-2" : "py-2.5",
        bad ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md",
          bad ? "bg-background text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-4" aria-hidden />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="truncate font-medium text-foreground">{item.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">· {formatBytes(item.file.size)}</span>
        </p>
        {item.status === "uploading" ? (
          <div className="flex items-center gap-3">
            <Progress value={item.progress} aria-label={`Uploading ${item.file.name}`} className="h-1.5" />
            <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{item.progress}%</span>
          </div>
        ) : bad ? (
          <p className="text-xs text-destructive">{item.error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{item.status === "uploaded" ? "Uploaded" : "Ready to send"}</p>
        )}
      </div>

      {item.status === "uploaded" && <CircleCheck className="size-4 shrink-0 text-success" aria-label="Uploaded" />}
      {bad && <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />}
      {item.status === "failed" && (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRetry} aria-label={`Try ${item.file.name} again`}>
          <RotateCw />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={onRemove}
        aria-label={`Remove ${item.file.name}`}
      >
        <X />
      </Button>
    </li>
  );
}
