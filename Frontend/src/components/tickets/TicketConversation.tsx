import { useState } from "react";
import { CircleCheck, CircleX, FilePlus2, MessagesSquare } from "lucide-react";
import type { Ticket, TicketComment } from "@/types/ticket.types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommentMenu, EventLine, MessageBody, MessageCard } from "./timelineParts";
import {
  canModifyComment,
  displayStatus,
  firstName,
  roleWord,
  systemEventOf,
  type TicketPermissions,
} from "./ticketDetail";

interface TicketConversationProps {
  ticket: Ticket;
  /** Already filtered to what this user may see */
  comments: TicketComment[];
  permissions: TicketPermissions;
  /** Resolves true when saved, so the editor can close */
  onSaveEdit: (commentId: number, body: string) => Promise<boolean>;
  onRequestDelete: (commentId: number) => void;
}

/**
 * The ticket's timeline (briefing p.41, p.48): the request itself, public replies as white
 * cards, internal notes in amber with a lock (staff only), approve / reject as small grey events.
 */
export default function TicketConversation({ ticket, comments, permissions, onSaveEdit, onRequestDelete }: TicketConversationProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const replies = comments.filter((c) => !systemEventOf(c));
  const notes = replies.filter((c) => c.is_internal).length;
  const publicReplies = replies.length - notes;

  const startEdit = (c: TicketComment) => {
    setEditingId(c.comment_id);
    setDraft(c.body);
  };

  const saveEdit = async (commentId: number) => {
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await onSaveEdit(commentId, draft.trim());
    setSaving(false);
    if (ok) {
      setEditingId(null);
      setDraft("");
    }
  };

  const requesterIsMe = permissions.isRequester;
  const isFinished = ["resolved", "closed", "cancelled"].includes(displayStatus(ticket));
  const requesterName = ticket.requester_name || "Requester";

  return (
    <section aria-labelledby="conversation-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="conversation-title" className="text-base font-semibold tracking-tight">
          Conversation
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {publicReplies === 0 ? "No replies yet" : `${publicReplies} ${publicReplies === 1 ? "reply" : "replies"}`}
          {permissions.canSeeInternal && notes > 0 && ` · ${notes} internal ${notes === 1 ? "note" : "notes"}`}
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        <EventLine icon={FilePlus2} time={ticket.created_at}>
          <span className="font-medium text-foreground">{requesterIsMe ? "You" : requesterName}</span> submitted this
          request
          {ticket.category_name && <> · {ticket.category_name}</>}
        </EventLine>

        {ticket.description?.trim() && (
          <MessageCard
            name={requesterName}
            meta={requesterIsMe ? "You" : "Requester"}
            time={ticket.created_at}
          >
            <MessageBody>{ticket.description}</MessageBody>
          </MessageCard>
        )}

        {comments.map((c) => {
          const event = systemEventOf(c);
          const isMe = String(c.author_id) === permissions.userId;
          const author = c.author_name || "Someone";

          if (event) {
            return (
              <EventLine
                key={c.comment_id}
                icon={event.kind === "approved" ? CircleCheck : CircleX}
                time={c.created_at}
                staffOnly={c.is_internal}
                note={event.note}
              >
                <span className="font-medium text-foreground">{isMe ? "You" : author}</span>{" "}
                {event.kind === "approved" ? "approved the request" : "rejected the request"}
              </EventLine>
            );
          }

          const isRequester = String(c.author_id) === String(ticket.requester_id);
          const meta = isMe
            ? "You"
            : isRequester
              ? "Requester"
              : [roleWord(c.author_role), ticket.department_name].filter(Boolean).join(" · ");
          const editing = editingId === c.comment_id;
          const modifiable = canModifyComment(c, permissions.userId);

          return (
            <MessageCard
              key={c.comment_id}
              name={author}
              meta={meta}
              time={c.created_at}
              edited={!!c.updated_at && c.updated_at !== c.created_at}
              internal={c.is_internal}
              menu={
                modifiable && !editing ? (
                  <CommentMenu onEdit={() => startEdit(c)} onDelete={() => onRequestDelete(c.comment_id)} />
                ) : null
              }
            >
              {editing ? (
                <div className="flex flex-col gap-3">
                  <Textarea
                    aria-label="Edit comment"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit(c.comment_id);
                    }}
                    autoFocus
                    rows={3}
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

      {replies.length === 0 && !isFinished && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <MessagesSquare className="size-3.5" aria-hidden />
          {permissions.isStaff
            ? `Nothing from the team yet. Your reply is emailed to ${firstName(ticket.requester_name)}.`
            : "No replies yet. Add anything that helps below."}
        </p>
      )}
    </section>
  );
}
