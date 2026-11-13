import { useEffect, useState } from "react";
import { Download, FileText, ImageIcon, ShieldCheck } from "lucide-react";
import { api } from "@/services/apiClient";
import { attachmentUrl } from "@/services/attachments";
import { cn } from "@/lib/utils";
import SectionCard from "@/components/app/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/components/request/attachmentRules";
import type { RequestFile } from "./fileList";

/**
 * An image preview loaded through the API with the session cookie (files never have public links).
 * Falls back to an icon when the preview can't load.
 */
export function AttachmentThumb({ id, className }: { id: number; className?: string }) {
  const [state, setState] = useState<{ id: number; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    api
      .get<Blob>(`/attachments/${id}/thumb`, { responseType: "blob" })
      .then((res) => {
        url = URL.createObjectURL(res.data);
        if (alive) setState({ id, url, failed: false });
        else URL.revokeObjectURL(url);
      })
      .catch(() => alive && setState({ id, url: null, failed: true }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const current = state?.id === id ? state : null;
  if (!current) return <Skeleton className={cn("rounded-md", className)} />;
  if (!current.url) {
    return (
      <span className={cn("flex items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
        <ImageIcon className="size-5" aria-hidden />
      </span>
    );
  }
  return <img src={current.url} alt="" className={cn("rounded-md object-cover", className)} />;
}

/** One file as a tile: a picture preview or a document icon, its name and size; opens the download */
export function FileTile({ file }: { file: RequestFile }) {
  return (
    <a
      href={attachmentUrl(file.id)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Download ${file.name}`}
      className="group flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background p-2 transition-colors outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {file.isImage ? (
        <AttachmentThumb id={file.id} className="aspect-[4/3] w-full" />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-6" aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-1.5 px-0.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{file.name}</span>
        <Download className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
      </span>
      {file.size !== null && <span className="-mt-1.5 px-0.5 text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>}
    </a>
  );
}

/** "Files on this request" side card (briefing p.42): thumbnails for pictures, tiles for documents */
export function RequestFilesCard({ files, loading }: { files: RequestFile[]; loading?: boolean }) {
  if (!loading && files.length === 0) return null;
  return (
    <SectionCard title="Files on this request" action={files.length > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{files.length}</span> : undefined}>
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {files.map((file) => (
            <li key={file.id} className="min-w-0">
              <FileTile file={file} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** "Who can see your files?" (p.42): builds trust for HR documents */
export function WhoCanSeeFiles({ team, className }: { team: string | null | undefined; className?: string }) {
  return (
    <SectionCard className={className} title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden />Who can see your files?</span>}>
      <p className="text-sm text-muted-foreground">
        You and the {team ?? "support"} team. Files are never public links: every download checks that you can see this request.
      </p>
    </SectionCard>
  );
}
