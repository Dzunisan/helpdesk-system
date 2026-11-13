import { useState, type ReactNode } from "react";
import {
  CircleCheck,
  CircleX,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Signal,
  Trash2,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import type { CategoryField, Ticket, TimelineComment, TimelineEvent, TimelineItem } from "@/types/api";
import { formatSast } from "@/lib/format";
import UserAvatar from "@/components/app/UserAvatar";
import KeyValueList from "@/components/app/KeyValueList";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { formatAnswer, humanizeKey, statusWords } from "./portalText";

interface PublicTimelineProps {
  ticket: Ticket;
  /** GET /timeline items, oldest first. The server already removed internal notes and events. */
  items: TimelineItem[];
  /** The category's extra fields, for answer labels and formats */
  fields?: CategoryField[];
  /** Resolves true when saved */
  onEdit: (commentId: number, body: string) => Promise<boolean>;
  onDelete: (commentId: number) => Promise<void>;
}

/**
 * The employee's public timeline (briefing p.41, S4): events as small grey lines, replies as
 * white cards, the original request first. Times in SAST, e.g. "Tue, 10 Nov, 09:02".
 */
export default function PublicTimeline({ ticket, items, fields = [], onEdit, onDelete }: PublicTimelineProps) {
  const viewerId = String(ticket.requester_id);
  const [deleting, setDeleting] = useState<TimelineComment | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const original = <OriginalRequest key="original" ticket={ticket} fields={fields} />;
  const hasCreated = items.some((item) => item.kind === "event" && item.type === "created");

  const rows: ReactNode[] = hasCreated ? [] : [original];
  for (const item of items) {
    if (item.kind === "comment") {
      rows.push(
        <CommentCard
          key={item.id}
          comment={item}
          mine={item.actor.user_id === viewerId}
          onEdit={onEdit}
          onRequestDelete={() => setDeleting(item)}
        />,
      );
      continue;
    }
    const line = eventLine(item, viewerId, ticket);
    if (line) rows.push(<EventRow key={item.id} at={item.at} icon={line.icon} note={item.note}>{line.text}</EventRow>);
    if (item.type === "created") rows.push(original);
  }

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    await onDelete(deleting.comment_id);
    setBusyDelete(false);
    setDeleting(null);
  };

  return (
    <>
      <ol aria-label="Timeline" className="flex flex-col gap-3">
        {rows}
      </ol>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && !busyDelete && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears for everyone. The timeline keeps a "Message removed" line in its place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyDelete}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyDelete}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {busyDelete && <Spinner data-icon="inline-start" />}
              Delete message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const strong = (text: ReactNode) => <span className="font-medium text-foreground">{text}</span>;

/** What an event says to the requester; null for events the timeline shows another way */
function eventLine(event: TimelineEvent, viewerId: string, ticket: Ticket): { icon: LucideIcon; text: ReactNode } | null {
  const isMe = event.actor?.user_id === viewerId;
  const who = event.actor ? (isMe ? "You" : event.actor.name) : "Helpdesk";
  const to = event.to_label ?? event.to_value;
  const from = event.from_label ?? event.from_value;

  switch (event.type) {
    case "created":
      return {
        icon: FilePlus2,
        text: (
          <>
            {isMe ? "You" : strong(who)} submitted this request
            {ticket.category_name && <> · {ticket.category_name}</>}
          </>
        ),
      };
    case "claimed":
      return { icon: UserRoundCheck, text: <>{strong(to ?? who)} picked this up</> };
    case "assigned":
      return {
        icon: UserRoundCheck,
        text: from ? (
          <>
            Passed from {strong(from)} to {strong(to)}
          </>
        ) : (
          <>{strong(to)} is now handling this</>
        ),
      };
    case "status_changed": {
      // Claiming and reopening already have their own line
      if (event.from_value === "New" && event.to_value === "Open") return null;
      if (event.from_value === "Resolved" && event.to_value === "Open") return null;
      if (event.to_value === "Closed" && !event.actor) return { icon: CircleCheck, text: <>Closed automatically after 5 days</> };
      if (event.to_value === "Closed" && isMe) return { icon: CircleCheck, text: <>You confirmed it's fixed. {strong("Closed")}</> };
      if (event.to_value === "Cancelled" && isMe) return { icon: CircleX, text: <>You cancelled this request</> };
      if (event.to_value === "Resolved") return { icon: CircleCheck, text: <>{strong(who)} marked this {strong("Resolved")}</> };
      if (event.to_value === "Open" && event.from_value === "Waiting on employee" && isMe) {
        return { icon: RefreshCw, text: <>Status changed to {strong("Open")} (you replied)</> };
      }
      return { icon: RefreshCw, text: <>Status changed to {strong(statusWords(event.to_value))}</> };
    }
    case "priority_changed":
      return { icon: Signal, text: <>Priority changed to {strong(to)}</> };
    case "approved":
      return { icon: CircleCheck, text: <>{strong(who)} approved this request</> };
    case "rejected":
      return { icon: CircleX, text: <>{strong(who)} declined this request</> };
    case "reopened":
      return { icon: RotateCcw, text: <>{isMe ? "You said" : <>{strong(who)} said</>} it's still broken. Reopened</> };
    default:
      // comment_deleted: the comment keeps its place with a "Message removed" line
      return null;
  }
}

function EventRow({ icon: Icon, at, note, children }: { icon: LucideIcon; at: string; note?: string | null; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 px-1 py-1">
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
        <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">{children}</p>
        <time dateTime={at} className="shrink-0 tabular-nums">
          {formatSast(at)}
        </time>
      </div>
      {note && <p className="ml-6 border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-foreground/80">{note}</p>}
    </li>
  );
}

function CardHead({ name, tag, at, children }: { name: string; tag: ReactNode; at: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <UserAvatar name={name} size="sm" />
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-medium text-foreground">{name}</span>
        {tag}
      </p>
      <time dateTime={at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatSast(at)}
      </time>
      {children}
    </div>
  );
}

const YOU = (
  <Badge variant="secondary" className="h-4.5 px-1.5 text-[11px]">
    You
  </Badge>
);

/** The request itself, as the first message */
function OriginalRequest({ ticket, fields }: { ticket: Ticket; fields: CategoryField[] }) {
  const answers = Object.entries(ticket.extra_fields ?? {}).filter(([, value]) => value !== null && value !== "");
  return (
    <li>
      <Card className="gap-3 border border-border p-4 shadow-none ring-0 sm:p-5">
        <CardHead name={ticket.requester_name ?? "You"} tag={YOU} at={ticket.created_at} />
        {ticket.description && <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{ticket.description}</p>}
        {answers.length > 0 && (
          <>
            <Separator />
            <KeyValueList
              variant="plain"
              items={answers.map(([key, value]) => {
                const field = fields.find((f) => f.key === key);
                return { key, label: field?.label ?? humanizeKey(key), value: formatAnswer(value, field) };
              })}
            />
          </>
        )}
      </Card>
    </li>
  );
}

interface CommentCardProps {
  comment: TimelineComment;
  mine: boolean;
  onEdit: (commentId: number, body: string) => Promise<boolean>;
  onRequestDelete: () => void;
}

function CommentCard({ comment, mine, onEdit, onRequestDelete }: CommentCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const name = comment.actor.name;

  if (comment.body === null || comment.deleted_at) {
    return (
      <EventRow icon={Trash2} at={comment.deleted_at ?? comment.at}>
        Message removed by {mine ? "you" : name}
      </EventRow>
    );
  }

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const ok = await onEdit(comment.comment_id, body);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const tag = mine ? YOU : comment.actor.department_name && <span className="text-xs text-muted-foreground">{comment.actor.department_name}</span>;

  return (
    <li>
      <Card className={cn("gap-3 border p-4 shadow-none ring-0 sm:p-5", mine ? "border-border" : "border-primary/15")}>
        <CardHead name={name} tag={tag} at={comment.at}>
          {comment.can_edit && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Message options" className="-my-1 -mr-2">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(comment.body ?? "");
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onRequestDelete}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHead>

        {editing ? (
          <div className="flex flex-col gap-3">
            <Textarea
              aria-label="Edit your message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="min-h-20"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={saving || !draft.trim()} onClick={() => void save()}>
                {saving && <Spinner data-icon="inline-start" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {comment.body}
            {comment.edited_at && <span className="ml-1.5 text-xs text-muted-foreground">(edited)</span>}
          </p>
        )}
      </Card>
    </li>
  );
}
