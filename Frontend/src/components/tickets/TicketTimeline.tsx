import { useState, type ReactNode } from "react";
import {
  AlarmClock,
  ArrowRight,
  Check,
  CircleCheck,
  CircleDot,
  CircleX,
  FilePlus2,
  MessageSquareOff,
  RotateCcw,
  SignalHigh,
  UserCheck,
  UserRoundPlus,
} from "lucide-react";
import type { Ticket, TimelineComment, TimelineEvent, TimelineItem } from "@/types/api";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import ErrorState from "@/components/app/ErrorState";
import { formatTarget, minutesBetween } from "@/components/queue/ticketSla";
import { CommentMenu, EventLine, MessageBody, MessageCard } from "./timelineParts";
import { roleWord } from "./ticketDetail";

interface TicketTimelineProps {
  ticket: Ticket;
  /** GET /api/tickets/:id/timeline items, oldest first; null while loading */
  items: TimelineItem[] | null;
  error?: string | null;
  onRetry?: () => void;
  /** The signed-in user's id ("You") */
  userId: string;
  /** Resolves true when saved, so the editor closes */
  onSaveEdit: (commentId: number, body: string) => Promise<boolean>;
  onRequestDelete: (commentId: number) => void;
}

type Row =
  | { kind: "event"; at: string; event: TimelineEvent; folded?: TimelineEvent }
  | { kind: "comment"; at: string; comment: TimelineComment }
  | { kind: "request"; at: string }
  | { kind: "sla"; at: string; tone: "danger" | "success"; text: ReactNode };

const FOLD_WINDOW_MS = 5_000;
const ms = (iso: string) => new Date(iso).getTime();

/**
 * Builds the rows: the request itself after its "created" event, a claim/assign folded with the
 * New -> Open it caused, and the SLA facts the timeline doesn't store (p.48 "First response sent in
 * 48 min", p.49 the rose "target missed" line). Sorted by time, oldest first.
 */
function buildRows(ticket: Ticket, items: TimelineItem[], now: number): Row[] {
  const rows: Row[] = [];
  let sawCreated = false;

  for (const item of items) {
    if (item.kind === "comment") {
      rows.push({ kind: "comment", at: item.at, comment: item });
      continue;
    }
    if (item.type === "comment_deleted") continue; // the comment keeps its place as "Message removed"
    const prev = rows[rows.length - 1];
    if (
      item.type === "status_changed" &&
      item.from_value === "New" &&
      item.to_value === "Open" &&
      prev?.kind === "event" &&
      (prev.event.type === "claimed" || prev.event.type === "assigned") &&
      !prev.folded &&
      Math.abs(ms(item.at) - ms(prev.at)) <= FOLD_WINDOW_MS
    ) {
      prev.folded = item;
      continue;
    }
    rows.push({ kind: "event", at: item.at, event: item });
    if (item.type === "created") {
      sawCreated = true;
      rows.push({ kind: "request", at: item.at });
    }
  }
  if (!sawCreated) rows.unshift({ kind: "request", at: ticket.created_at });

  // First response: met (grey/green line) or missed (rose)
  const frDue = ticket.first_response_due_at;
  if (frDue) {
    const target = formatTarget(minutesBetween(ticket.created_at, frDue));
    const stopped = ticket.first_response_at ?? ticket.resolved_at;
    if (ticket.first_response_at && ms(ticket.first_response_at) <= ms(frDue)) {
      rows.push({
        kind: "sla",
        at: ticket.first_response_at,
        tone: "success",
        text: (
          <>
            First response sent in{" "}
            <span className="font-medium text-emerald-700">{formatTarget(minutesBetween(ticket.created_at, ticket.first_response_at))}</span>{" "}
            (target {target})
          </>
        ),
      });
    } else if ((stopped ? ms(stopped) : now) > ms(frDue) && ticket.ticket_status !== "Cancelled") {
      rows.push({
        kind: "sla",
        at: frDue,
        tone: "danger",
        text: (
          <>
            <span className="font-medium">First response target ({target}) missed</span> at {formatSast(frDue, "time")}
          </>
        ),
      });
    }
  }
  const resDue = ticket.resolution_due_at;
  if (resDue && ticket.ticket_status !== "Cancelled" && (ticket.resolved_at ? ms(ticket.resolved_at) : now) > ms(resDue)) {
    rows.push({
      kind: "sla",
      at: resDue,
      tone: "danger",
      text: (
        <>
          <span className="font-medium">Resolution target ({formatTarget(minutesBetween(ticket.created_at, resDue))}) missed</span> at{" "}
          {formatSast(resDue, "time")}
        </>
      ),
    });
  }

  // Stable sort by time: rows built in server order keep it on ties
  return rows.map((row, index) => ({ row, index })).sort((a, b) => ms(a.row.at) - ms(b.row.at) || a.index - b.index).map((r) => r.row);
}

/**
 * The merged ticket timeline for staff (briefing p.48-49, S4): events in grey, replies in white,
 * internal notes in amber with a lock, and missed SLA targets in rose.
 */
export default function TicketTimeline({ ticket, items, error, onRetry, userId, onSaveEdit, onRequestDelete }: TicketTimelineProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());

  if (error) return <ErrorState title="Couldn't load the timeline" description={error} onRetry={onRetry} stacked />;
  if (!items) return <TimelineSkeleton />;

  const rows = buildRows(ticket, items, now);
  const who = (person: { user_id: string; name: string } | null) => (!person ? "System" : person.user_id === userId ? "You" : person.name);

  const saveEdit = async (commentId: number) => {
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await onSaveEdit(commentId, draft.trim());
    setSaving(false);
    if (ok) setEditingId(null);
  };

  return (
    <ol aria-label="Timeline" className="flex flex-col gap-3">
      {rows.map((row, index) => {
        if (row.kind === "request") {
          if (!ticket.description?.trim()) return null;
          return (
            <MessageCard key="request" name={ticket.requester_name || "Requester"} meta={ticket.requester_id === userId ? "You" : "Requester"} time={ticket.created_at}>
              <MessageBody>{ticket.description}</MessageBody>
            </MessageCard>
          );
        }

        if (row.kind === "sla") {
          return (
            <EventLine key={`sla-${index}`} icon={row.tone === "danger" ? AlarmClock : Check} time={row.at} tone={row.tone}>
              {row.text}
            </EventLine>
          );
        }

        if (row.kind === "event") {
          const { event, folded } = row;
          const { icon, text } = describeEvent(event, who(event.actor), ticket);
          return (
            <EventLine key={event.id} icon={icon} time={event.at} staffOnly={event.is_internal} note={event.note}>
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {text}
                {folded && (
                  <>
                    <span aria-hidden>·</span>
                    <Transition from={<StatusBadge status={folded.from_value} />} to={<StatusBadge status={folded.to_value} />} />
                  </>
                )}
              </span>
            </EventLine>
          );
        }

        const c = row.comment;
        const author = c.actor?.name || "Someone";
        if (c.deleted_at || c.body === null) {
          return (
            <EventLine key={c.id} icon={MessageSquareOff} time={c.deleted_at ?? c.at} staffOnly={c.is_internal}>
              <span className="italic">
                {c.is_internal ? "Internal note" : "Message"} removed by {who(c.actor)}
              </span>
            </EventLine>
          );
        }
        const isRequester = c.actor?.user_id === ticket.requester_id;
        const meta =
          c.actor?.user_id === userId
            ? "You"
            : isRequester
              ? "Requester"
              : [roleWord(c.actor?.role), c.actor?.department_name].filter(Boolean).join(" · ");
        const editing = editingId === c.comment_id;
        return (
          <MessageCard
            key={c.id}
            name={author}
            meta={meta}
            time={c.at}
            edited={!!c.edited_at}
            internal={c.is_internal}
            menu={
              c.can_edit && !editing ? (
                <CommentMenu
                  onEdit={() => {
                    setEditingId(c.comment_id);
                    setDraft(c.body ?? "");
                  }}
                  onDelete={() => onRequestDelete(c.comment_id)}
                />
              ) : null
            }
          >
            {editing ? (
              <div className="flex flex-col gap-3">
                <Textarea
                  aria-label="Edit message"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingId(null);
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit(c.comment_id);
                  }}
                  autoFocus
                  rows={3}
                  maxLength={5000}
                  className={cn("min-h-20 bg-background", c.is_internal && "border-amber-300")}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void saveEdit(c.comment_id)} disabled={saving || !draft.trim()}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <MessageBody>{c.body}</MessageBody>
            )}
          </MessageCard>
        );
      })}
    </ol>
  );
}

function Transition({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {from}
      <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
      {to}
    </span>
  );
}

function Name({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** Plain words for one event (briefing p.48: "Thabo Nkosi changed priority Normal → High · due times recalculated") */
function describeEvent(event: TimelineEvent, who: string, ticket: Ticket): { icon: typeof CircleDot; text: ReactNode } {
  const actor = <Name>{who}</Name>;
  switch (event.type) {
    case "created":
      return {
        icon: FilePlus2,
        text: (
          <span>
            {actor} created this via the portal{ticket.category_name ? ` · ${ticket.category_name}` : ""}
          </span>
        ),
      };
    case "claimed":
      return { icon: UserCheck, text: <span>{actor} claimed this</span> };
    case "assigned":
      return {
        icon: UserRoundPlus,
        text: event.from_label ? (
          <span>
            {actor} reassigned this from <Name>{event.from_label}</Name> to <Name>{event.to_label ?? "someone"}</Name>
          </span>
        ) : (
          <span>
            {actor} assigned this to <Name>{event.to_label ?? "someone"}</Name>
          </span>
        ),
      };
    case "status_changed":
      if (!event.actor && event.to_value === "Closed")
        return { icon: CircleCheck, text: <span>Closed automatically 5 days after it was resolved</span> };
      return {
        icon: CircleDot,
        text: (
          <>
            <span>{actor} changed status</span>
            <Transition from={<StatusBadge status={event.from_value} />} to={<StatusBadge status={event.to_value} />} />
          </>
        ),
      };
    case "priority_changed":
      return {
        icon: SignalHigh,
        text: (
          <>
            <span>{actor} changed priority</span>
            <Transition from={<PriorityBadge priority={event.from_value} />} to={<PriorityBadge priority={event.to_value} />} />
            <span>· due times recalculated</span>
          </>
        ),
      };
    case "approved":
      return { icon: CircleCheck, text: <span>{actor} approved the request</span> };
    case "rejected":
      return { icon: CircleX, text: <span>{actor} rejected the request</span> };
    case "reopened":
      return { icon: RotateCcw, text: <span>{actor} reopened this: still broken</span> };
    default:
      return { icon: CircleDot, text: <span>{actor} updated this</span> };
  }
}

function TimelineSkeleton() {
  const SK = "bg-foreground/[0.07]";
  return (
    <div aria-busy="true" aria-label="Loading the timeline" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-4 sm:px-5">
            <Skeleton className={cn("size-6 rounded-full", SK)} />
            <Skeleton className={cn("h-3 w-56", SK)} />
          </div>
          <div className="flex gap-3 rounded-xl border border-border p-4 sm:p-5">
            <Skeleton className={cn("size-8 shrink-0 rounded-full", SK)} />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className={cn("h-3.5 w-32", SK)} />
              <Skeleton className={cn("h-3.5 w-full", SK)} />
              <Skeleton className={cn("h-3.5 w-2/3", SK)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
