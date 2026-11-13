import type { ReactNode } from "react";
import { Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/*
 * The pieces of a ticket timeline (briefing p.41, p.48-49): events as small grey lines,
 * replies as white cards, internal notes in amber with a lock.
 */

export function MessageBody({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">{children}</p>;
}

/** "Tue 10 Nov, 09:02" (the house format, p.13) with the year on hover; the same in every view */
export function TimeStamp({ value, className }: { value: string; className?: string }) {
  return (
    <time
      dateTime={value}
      title={formatSast(value, "full")}
      className={cn("shrink-0 text-xs text-muted-foreground tabular-nums", className)}
    >
      {formatSast(value)}
    </time>
  );
}

/** A reply (white) or internal note (amber, lock, "Internal note") */
export function MessageCard({
  name,
  meta,
  time,
  edited,
  internal,
  menu,
  className,
  children,
}: {
  name: string;
  meta?: ReactNode;
  time: string;
  edited?: boolean;
  internal?: boolean;
  menu?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        internal ? "border-warning-border bg-warning-muted" : "border-border bg-background",
        className,
      )}
    >
      <div className="flex gap-3">
        <UserAvatar name={name} className="mt-0.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-h-8 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-foreground">{name}</span>
              {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
              {internal && (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-strong">
                  <Lock className="size-3" aria-hidden />
                  Internal note
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="flex flex-col items-end gap-0.5 pt-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                <TimeStamp value={time} />
                {edited && <span className="text-xs text-muted-foreground">(edited)</span>}
              </span>
              {menu}
            </div>
          </div>
          {children}
        </div>
      </div>
    </li>
  );
}

/** A small grey event line ("Thabo claimed this · New → Open"), with an optional quoted note */
export function EventLine({
  icon: Icon,
  time,
  staffOnly,
  note,
  tone = "default",
  children,
}: {
  icon: typeof Lock;
  time: string;
  staffOnly?: boolean;
  note?: string | null;
  /** `danger`: a missed SLA target, in rose (p.49) */
  tone?: "default" | "danger" | "success";
  children: ReactNode;
}) {
  return (
    // px-4/5 + w-8 puts the icon on the same vertical line as the avatars in the cards
    <li
      className={cn(
        "flex flex-col gap-2 py-1",
        tone === "danger"
          ? "rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 sm:px-5"
          : "px-4 sm:px-5",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex w-8 shrink-0 justify-center pt-px">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : tone === "success"
                  ? "bg-success-muted text-success"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        </span>
        {/* Phones: the time goes under the words so the line keeps its width; from sm it sits on the right */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1 sm:flex-row sm:items-start sm:gap-3">
          <div className={cn("min-w-0 flex-1 text-xs", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
            {children}
            {staffOnly && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-warning">
                <Lock className="size-3" aria-hidden />
                Staff only
              </span>
            )}
          </div>
          <TimeStamp value={time} className={cn("text-[11px] sm:text-xs", tone === "danger" && "text-destructive")} />
        </div>
      </div>
      {note && (
        <blockquote
          className={cn(
            "ml-11 rounded-lg border px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground",
            // A staff-only note (e.g. the reason for a move) reads amber, like internal notes
            staffOnly ? "border-warning-border bg-warning-muted" : "border-border bg-muted/40",
          )}
        >
          {note}
        </blockquote>
      )}
    </li>
  );
}

export function CommentMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    // Not modal: the delete AlertDialog opens straight from a menu item
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Comment actions" className="-my-1 -mr-1.5 size-9 sm:size-7">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
