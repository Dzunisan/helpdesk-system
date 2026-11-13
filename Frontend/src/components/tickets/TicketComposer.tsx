import { useId, useState } from "react";
import { Lock, Mail, MessageSquare, Send } from "lucide-react";
import type { Ticket } from "@/types/ticket.types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { firstName, type TicketPermissions } from "./ticketDetail";

type Mode = "reply" | "note";

interface TicketComposerProps {
  ticket: Ticket;
  permissions: TicketPermissions;
  /** Posts the comment; resolves true when it was saved so the box can clear */
  onSubmit: (body: string, internal: boolean) => Promise<boolean>;
}

/**
 * Reply box (briefing p.48-49). Staff get two tabs: "Public reply" and "Internal note";
 * the note turns the whole composer amber and says only staff can see it.
 */
export default function TicketComposer({ ticket, permissions, onSubmit }: TicketComposerProps) {
  const [mode, setMode] = useState<Mode>("reply");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const id = useId();

  const internal = permissions.canAddInternal && mode === "note";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const replyTo = permissions.isStaff
    ? firstName(ticket.requester_name, "the requester")
    : ticket.assignee_name
      ? firstName(ticket.assignee_name)
      : `${ticket.department_name ?? "the"} team`;

  const hint = internal
    ? { icon: Lock, text: "Only staff can see this" }
    : permissions.isStaff
      ? ticket.requester_email
        ? { icon: Mail, text: `Emailed to ${replyTo}` }
        : { icon: MessageSquare, text: "Shown to the requester" }
      : ticket.assignee_email
        ? { icon: Mail, text: `Emailed to ${replyTo}` }
        : { icon: MessageSquare, text: `Shown to the ${ticket.department_name ?? "support"} team` };

  const submit = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onSubmit(text, internal);
    setSending(false);
    if (ok) {
      setBody("");
      setMode("reply");
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label={internal ? "Add an internal note" : "Send a reply"}
      className={cn(
        "flex flex-col rounded-xl border transition-colors focus-within:ring-3",
        internal
          ? "border-amber-300 bg-amber-50 focus-within:ring-amber-300/40 dark:border-amber-900/60 dark:bg-amber-950/40"
          : "border-border bg-background focus-within:border-ring focus-within:ring-ring/20",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-3 sm:px-4">
        {permissions.canAddInternal ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList
              aria-label="Reply or internal note"
              className={cn(
                "group-data-horizontal/tabs:h-10 sm:group-data-horizontal/tabs:h-8",
                internal && "bg-amber-100",
              )}
            >
              <TabsTrigger value="reply" className="px-3">
                Public reply
              </TabsTrigger>
              <TabsTrigger value="note" className="px-3 data-active:text-amber-800">
                <Lock aria-hidden />
                Internal note
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <label htmlFor={id} className="px-1 text-sm font-medium text-foreground">
            Reply
          </label>
        )}
        <span
          className={cn(
            "flex items-center gap-1.5 px-1 text-xs",
            internal ? "font-medium text-amber-800" : "text-muted-foreground",
          )}
        >
          <hint.icon className="size-3.5" aria-hidden />
          {hint.text}
        </span>
      </div>

      <Textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={4}
        maxLength={5000}
        aria-label={permissions.canAddInternal ? (internal ? "Internal note" : "Public reply") : undefined}
        placeholder={
          internal
            ? "Write a note for the team. The requester never sees it."
            : permissions.isStaff
              ? `Reply to ${replyTo}…`
              : `Add a reply for ${replyTo}…`
        }
        className="min-h-28 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0 sm:px-5 dark:bg-transparent"
      />

      <div className="flex items-center justify-between gap-3 px-3 pb-3 sm:px-4">
        <span className="hidden items-center gap-1 px-1 text-xs text-muted-foreground sm:flex">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>Enter</Kbd>
          <span className="ml-1">to send</span>
        </span>
        <Button
          type="submit"
          disabled={sending || !body.trim()}
          className={cn("ml-auto h-10 sm:h-9", internal && "bg-amber-600 text-white hover:bg-amber-700")}
        >
          {sending ? <Spinner data-icon="inline-start" /> : internal ? <Lock data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          {internal ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
