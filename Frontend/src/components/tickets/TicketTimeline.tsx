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
  RefreshCw,
  RotateCcw,
  SignalHigh,
  Star,
  UserCheck,
  UserRoundPlus,
  Building2,
  Paperclip,
} from "lucide-react";
import type { CategoryField, Ticket, TimelineComment, TimelineEvent, TimelineItem } from "@/types/api";
import { formatDuration, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import KeyValueList from "@/components/app/KeyValueList";
import ErrorState from "@/components/app/ErrorState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { minutesBetween } from "@/components/queue/ticketSla";
import { formatAnswer, humanizeKey, statusWords } from "@/components/portal/portalText";
import { CommentMenu, EventLine, MessageBody, MessageCard } from "./timelineParts";
import { roleWord } from "./ticketDetail";
import TimelineAttachments from "./TimelineAttachments";

/**
 * Who reads the timeline. The server already filters internal notes and events for a requester;
 * the audience switches the wording ("You", "picked this up") and hides the staff-only SLA lines.
 */
export type TimelineAudience = "staff" | "requester";

interface TicketTimelineProps {
  ticket: Ticket;
  /** GET /api/tickets/:id/timeline items, oldest first; null while loading */
  items: TimelineItem[] | null;
  audience: TimelineAudience;
  error?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  /** The signed-in user's id ("You") */
  userId: string;
  /** The category's extra fields, for answer labels and formats (keys are humanized without them) */
  fields?: CategoryField[];
  /** Resolves true when saved, so the editor closes */
  onSaveEdit: (commentId: number, body: string) => Promise<boolean>;
  /** Called after the person confirms in the timeline's own AlertDialog */
  onDelete: (commentId: number) => Promise<void>;
}

type EventRow = { kind: "event"; at: string; event: TimelineEvent; folded?: TimelineEvent };
type Row =
  | EventRow
  | { kind: "comment"; at: string; comment: TimelineComment }
  | { kind: "request"; at: string }
  | { kind: "sla"; at: string; tone: "danger" | "success"; text: ReactNode };

const FOLD_WINDOW_MS = 5_000;
const ms = (iso: string) => new Date(iso).getTime();

/** A status line that only repeats what the line before it already says (claim -> Open, reopen -> Open) */
const echoOf = (item: TimelineEvent, prev: Row | undefined): EventRow | null => {
  if (item.type !== "status_changed" || prev?.kind !== "event" || prev.folded) return null;
  if (Math.abs(ms(item.at) - ms(prev.at)) > FOLD_WINDOW_MS || item.to_value !== "Open") return null;
  const claim = item.from_value === "New" && (prev.event.type === "claimed" || prev.event.type === "assigned");
  const reopen = item.from_value === "Resolved" && prev.event.type === "reopened";
  return claim || reopen ? prev : null;
};

/**
 * Builds the rows: the request itself after its "created" event, a claim/assign folded with the
 * New -> Open it caused (and "Still broken" with its Resolved -> Open), and for staff the SLA facts
 * the timeline doesn't store (p.48 "First response sent in 48 min", p.49 the rose "target missed"
 * line). Sorted by time, oldest first.
 */
function buildRows(ticket: Ticket, items: TimelineItem[], audience: TimelineAudience, now: number): Row[] {
  const rows: Row[] = [];
  let sawCreated = false;
  // S14: a file sent with a message shows on the message; its "attached" event needs no line
  const sentFiles = new Set(
    items.flatMap((i) => (i.kind === "comment" ? (i.attachments ?? []).map((a) => String(a.attachment_id)) : [])),
  );

  for (const item of items) {
    if (item.kind === "comment") {
      rows.push({ kind: "comment", at: item.at, comment: item });
      continue;
    }
    if (item.type === "attached" && item.to_value && sentFiles.has(item.to_value)) continue;
    // The comment keeps its place ("Message removed", "edited"), so these facts need no line
    if (item.type === "comment_deleted" || item.type === "comment_edited") continue;
    const echoed = echoOf(item, rows[rows.length - 1]);
    if (echoed) {
      echoed.folded = item;
      continue;
    }
    rows.push({ kind: "event", at: item.at, event: item });
    if (item.type === "created") {
      sawCreated = true;
      rows.push({ kind: "request", at: item.at });
    }
  }
  if (!sawCreated) rows.unshift({ kind: "request", at: ticket.created_at });

  if (audience === "staff") rows.push(...slaRows(ticket, now));

  // Stable sort by time: rows built in server order keep it on ties
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => ms(a.row.at) - ms(b.row.at) || a.index - b.index)
    .map((r) => r.row);
}

/** First response met (green) or missed (rose), resolution missed (rose): staff only */
function slaRows(ticket: Ticket, now: number): Row[] {
  const rows: Row[] = [];
  const frDue = ticket.first_response_due_at;
  if (frDue) {
    const target = formatDuration(minutesBetween(ticket.created_at, frDue));
    const stopped = ticket.first_response_at ?? ticket.resolved_at;
    if (ticket.first_response_at && ms(ticket.first_response_at) <= ms(frDue)) {
      rows.push({
        kind: "sla",
        at: ticket.first_response_at,
        tone: "success",
        text: (
          <>
            First response sent in{" "}
            <span className="font-medium text-success">{formatDuration(minutesBetween(ticket.created_at, ticket.first_response_at))}</span>{" "}
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
          <span className="font-medium">Resolution target ({formatDuration(minutesBetween(ticket.created_at, resDue))}) missed</span> at{" "}
          {formatSast(resDue, "time")}
        </>
      ),
    });
  }
  return rows;
}

/**
 * The one ticket timeline (briefing p.13, p.41, p.48-49; S4), for staff and for the requester:
 * events as small grey lines, replies as white cards, internal notes in amber with a lock, the
 * original request first, and (staff) missed SLA targets in rose. Times in SAST, "Tue 10 Nov, 09:02".
 */
export default function TicketTimeline({
  ticket,
  items,
  audience,
  error,
  onRetry,
  retrying,
  userId,
  fields = [],
  onSaveEdit,
  onDelete,
}: TicketTimelineProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [now] = useState(() => Date.now());

  if (error) return <ErrorState title="Couldn't load the timeline" description={error} onRetry={onRetry} retrying={retrying} stacked />;
  if (!items) return <TimelineSkeleton />;

  const rows = buildRows(ticket, items, audience, now);
  const who = (person: { user_id: string; name: string } | null) =>
    !person ? (audience === "staff" ? "System" : "Helpdesk") : person.user_id === userId ? "You" : person.name;

  const saveEdit = async (commentId: number) => {
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await onSaveEdit(commentId, draft.trim());
    setSaving(false);
    if (ok) setEditingId(null);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    await onDelete(deleteId);
    setDeleting(false);
    setDeleteId(null);
  };

  return (
    <>
      <ol aria-label="Timeline" className="flex flex-col gap-3">
        {rows.map((row, index) => {
          if (row.kind === "request") return <OriginalRequest key="request" ticket={ticket} userId={userId} fields={fields} />;

          if (row.kind === "sla") {
            return (
              <EventLine key={`sla-${index}`} icon={row.tone === "danger" ? AlarmClock : Check} time={row.at} tone={row.tone}>
                {row.text}
              </EventLine>
            );
          }

          if (row.kind === "event") {
            const { event, folded } = row;
            const line = audience === "staff" ? staffLine(event, who(event.actor), ticket) : requesterLine(event, who(event.actor), ticket);
            return (
              <EventLine key={event.id} icon={line.icon} time={event.at} staffOnly={event.is_internal} note={event.type === "attached" ? null : event.note}>
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {line.text}
                  {folded && audience === "staff" && (
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
            const by = who(c.actor);
            return (
              <EventLine key={c.id} icon={MessageSquareOff} time={c.deleted_at ?? c.at} staffOnly={c.is_internal}>
                <span className="italic">
                  {c.is_internal ? "Internal note" : "Message"} removed by {by === "You" ? "you" : by}
                </span>
              </EventLine>
            );
          }
          const mine = c.actor?.user_id === userId;
          const isRequester = c.actor?.user_id === String(ticket.requester_id);
          const meta = mine
            ? "You"
            : isRequester
              ? "Requester"
              : audience === "staff"
                ? [roleWord(c.actor?.role), c.actor?.department_name].filter(Boolean).join(" · ")
                : (c.actor?.department_name ?? "Support team");
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
                    onDelete={() => setDeleteId(c.comment_id)}
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
                    disabled={saving}
                    className={cn("min-h-20 bg-background", c.is_internal && "border-warning-border")}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void saveEdit(c.comment_id)} disabled={saving || !draft.trim()}>
                      {saving && <Spinner data-icon="inline-start" />}
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <MessageBody>{c.body}</MessageBody>
                  <TimelineAttachments files={c.attachments ?? []} showInternal={audience === "staff"} />
                </>
              )}
            </MessageCard>
          );
        })}
      </ol>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && !deleting && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears for everyone. The timeline keeps a "Message removed" line in its place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting && <Spinner data-icon="inline-start" />}
              Delete message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The request itself, as the first message, with the answers to the category's questions */
function OriginalRequest({ ticket, userId, fields }: { ticket: Ticket; userId: string; fields: CategoryField[] }) {
  const answers = Object.entries(ticket.extra_fields ?? {}).filter(([, value]) => value !== null && value !== "");
  const description = ticket.description?.trim();
  if (!description && answers.length === 0) return null;
  return (
    <MessageCard
      name={ticket.requester_name || "Requester"}
      meta={String(ticket.requester_id) === userId ? "You" : "Requester"}
      time={ticket.created_at}
    >
      {description && <MessageBody>{ticket.description}</MessageBody>}
      {answers.length > 0 && (
        <>
          {description && <Separator className="my-1" />}
          <KeyValueList
            variant="plain"
            items={answers.map(([key, value]) => {
              const field = fields.find((f) => f.key === key);
              return { key, label: field?.label ?? humanizeKey(key), value: formatAnswer(value, field) };
            })}
          />
        </>
      )}
    </MessageCard>
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

type Line = { icon: typeof CircleDot; text: ReactNode };

const outOfFive = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? `${n} out of 5` : "it";
};

/** Staff wording (briefing p.48: "Thabo Nkosi changed priority Normal → High · due times recalculated") */
function staffLine(event: TimelineEvent, who: string, ticket: Ticket): Line {
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
    case "feedback_given":
      return {
        icon: Star,
        text: (
          <span>
            {actor} {event.from_value ? "changed their rating to" : "rated this"} {outOfFive(event.to_value)}
          </span>
        ),
      };
    case "department_changed":
      // S12: one public line (note = the message to the requester), one internal (note = the reason)
      return event.is_internal
        ? { icon: Building2, text: <span>{actor} gave the reason for the move</span> }
        : {
            icon: Building2,
            text: (
              <span>
                {actor} moved this from <Name>{event.from_value ?? "another department"}</Name> to{" "}
                <Name>{event.to_value ?? "another department"}</Name> · now New and unassigned
              </span>
            ),
          };
    case "attached":
      return {
        icon: Paperclip,
        text: (
          <span>
            {actor} attached <Name>{event.note ?? "a file"}</Name>
          </span>
        ),
      };
    default:
      return { icon: CircleDot, text: <span>{actor} updated this</span> };
  }
}

/** The requester's wording (p.41): "You", "picked this up", "Waiting on you" */
function requesterLine(event: TimelineEvent, who: string, ticket: Ticket): Line {
  const isMe = who === "You";
  const actor = isMe ? "You" : <Name>{who}</Name>;
  const to = event.to_label ?? event.to_value;
  const from = event.from_label ?? event.from_value;
  switch (event.type) {
    case "created":
      return {
        icon: FilePlus2,
        text: (
          <span>
            {actor} submitted this request{ticket.category_name ? ` · ${ticket.category_name}` : ""}
          </span>
        ),
      };
    case "claimed":
      return {
        icon: UserCheck,
        text: (
          <span>
            <Name>{to ?? who}</Name> picked this up
          </span>
        ),
      };
    case "assigned":
      return {
        icon: UserRoundPlus,
        text: from ? (
          <span>
            Passed from <Name>{from}</Name> to <Name>{to}</Name>
          </span>
        ) : (
          <span>
            <Name>{to}</Name> is now handling this
          </span>
        ),
      };
    case "status_changed": {
      const status = (text: ReactNode, icon: typeof CircleDot = RefreshCw): Line => ({ icon, text: <span>{text}</span> });
      if (event.to_value === "Closed" && !event.actor) return status("Closed automatically after 5 days", CircleCheck);
      if (event.to_value === "Closed" && isMe) return status(<>You confirmed it's fixed. <Name>Closed</Name></>, CircleCheck);
      if (event.to_value === "Cancelled" && isMe) return status("You cancelled this request", CircleX);
      if (event.to_value === "Resolved") return status(<>{actor} marked this <Name>Resolved</Name></>, CircleCheck);
      if (event.to_value === "Open" && event.from_value === "Waiting on employee" && isMe) {
        return status(<>Status changed to <Name>Open</Name> (you replied)</>);
      }
      return status(<>Status changed to <Name>{statusWords(event.to_value)}</Name></>);
    }
    case "priority_changed":
      return {
        icon: SignalHigh,
        text: (
          <span>
            Priority changed to <Name>{to}</Name>
          </span>
        ),
      };
    case "approved":
      return { icon: CircleCheck, text: <span>{actor} approved this request</span> };
    case "rejected":
      return { icon: CircleX, text: <span>{actor} declined this request</span> };
    case "reopened":
      return { icon: RotateCcw, text: <span>{isMe ? "You said" : <>{actor} said</>} it's still broken. Reopened</span> };
    case "feedback_given":
      return {
        icon: Star,
        text: (
          <span>
            {actor} {event.from_value ? "changed the rating to" : "rated this"} {outOfFive(event.to_value)}
          </span>
        ),
      };
    case "department_changed":
      return {
        icon: Building2,
        text: (
          <span>
            Moved from <Name>{event.from_value ?? "another team"}</Name> to <Name>{event.to_value ?? "another team"}</Name>
          </span>
        ),
      };
    case "attached":
      return {
        icon: Paperclip,
        text: (
          <span>
            {actor} attached <Name>{event.note ?? "a file"}</Name>
          </span>
        ),
      };
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
            <Skeleton className={cn("h-3 w-56 max-w-full", SK)} />
          </div>
          <div className="flex gap-3 rounded-xl border border-border bg-background p-4 sm:p-5">
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
