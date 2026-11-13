import { CircleAlert, CircleCheck, FileText, Lock, Upload, X } from "lucide-react";
import { ATTACHMENT_MAX_FILES } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ACCEPT_WORDS, formatBytes } from "./attachmentUpload";
import type { ComposerFile } from "./useComposerFiles";

interface ComposerAttachmentsProps {
  files: ComposerFile[];
  onRemove: (key: string) => void;
  onInternalChange: (key: string, internal: boolean) => void;
  /** Staff on a public reply: each file gets its own Internal switch */
  perFileInternal: boolean;
  /** The whole message is an internal note: every file is staff-only */
  allInternal: boolean;
  onBrowse: () => void;
  dragging: boolean;
  disabled?: boolean;
}

/** The files inside the composer + the dashed drop zone (briefing p.42) */
export default function ComposerAttachments({
  files,
  onRemove,
  onInternalChange,
  perFileInternal,
  allInternal,
  onBrowse,
  dragging,
  disabled,
}: ComposerAttachmentsProps) {
  const full = files.filter((f) => f.status !== "error").length >= ATTACHMENT_MAX_FILES;
  return (
    <div className="flex flex-col gap-2 px-3 pb-3 sm:px-4">
      {files.length > 0 && (
        <ul aria-label="Files to send" className="-mx-1 flex max-h-60 flex-col gap-2 overflow-y-auto px-1 py-0.5">
          {files.map((f) => (
            <FileRow
              key={f.key}
              file={f}
              onRemove={() => onRemove(f.key)}
              showInternal={perFileInternal && f.status !== "error"}
              allInternal={allInternal}
              onInternalChange={(v) => onInternalChange(f.key, v)}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
      {!full && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 rounded-lg border border-dashed px-3 py-2.5 text-center text-xs transition-colors",
            dragging ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground",
          )}
        >
          <Upload className="mr-1 size-3.5" aria-hidden />
          <span>Drop files here or</span>
          <Button type="button" variant="link" size="sm" onClick={onBrowse} disabled={disabled} className="h-auto p-0 text-xs">
            browse
          </Button>
          <span className="basis-full sm:basis-auto">
            <span className="hidden sm:inline">· </span>
            {ACCEPT_WORDS} · up to 5 MB · {ATTACHMENT_MAX_FILES} files
          </span>
        </div>
      )}
    </div>
  );
}

function FileRow({
  file: f,
  onRemove,
  showInternal,
  allInternal,
  onInternalChange,
  disabled,
}: {
  file: ComposerFile;
  onRemove: () => void;
  showInternal: boolean;
  allInternal: boolean;
  onInternalChange: (internal: boolean) => void;
  disabled?: boolean;
}) {
  const error = f.status === "error";
  const internal = allInternal || f.internal;
  const switchId = `internal-${f.key}`;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        error ? "border-destructive/25 bg-destructive/5" : internal && !allInternal ? "border-warning-border bg-warning-muted" : "border-border bg-background",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {f.previewUrl ? <img src={f.previewUrl} alt="" className="size-full object-cover" /> : <FileText className="size-4" aria-hidden />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="truncate font-medium text-foreground">{f.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">· {formatBytes(f.file.size)}</span>
        </p>
        {error ? (
          <p className="text-xs text-destructive">{f.error}</p>
        ) : f.status === "uploading" ? (
          <div className="flex items-center gap-2">
            <Progress value={f.progress} aria-label={`Uploading ${f.file.name}`} className="h-1.5 flex-1" />
            <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{f.progress}%</span>
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {internal ? (
              <>
                <Lock className="size-3 text-warning" aria-hidden />
                Uploaded · only staff can see it
              </>
            ) : (
              "Uploaded"
            )}
          </p>
        )}
      </div>
      {showInternal && (
        <span className="flex shrink-0 items-center gap-1.5">
          <Switch
            id={switchId}
            size="sm"
            checked={f.internal}
            onCheckedChange={onInternalChange}
            disabled={disabled || f.status === "uploading"}
            aria-label={`Internal: only staff can see ${f.file.name}`}
            className="data-checked:bg-warning-solid"
          />
          <label htmlFor={switchId} className={cn("hidden text-xs sm:inline", f.internal ? "font-medium text-warning-strong" : "text-muted-foreground")}>
            Internal
          </label>
        </span>
      )}
      {error ? (
        <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
      ) : f.status === "done" ? (
        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${f.file.name}`} className="-mr-1 shrink-0 text-muted-foreground">
        <X />
      </Button>
    </li>
  );
}
