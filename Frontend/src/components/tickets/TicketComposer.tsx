import { useId, useRef, useState, type DragEvent } from "react";
import { ChevronDown, CircleAlert, Hourglass, Lock, Mail, MessageSquare, Paperclip, Send, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Macro, Ticket, TicketStatus } from "@/types/api";
import { renderMacro } from "@/services/macros";
import { toApiError } from "@/services/apiClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type TicketPermissions } from "./ticketDetail";
import { firstNameOf } from "@/lib/format";
import ComposerAttachments from "./ComposerAttachments";
import { useComposerFiles } from "./useComposerFiles";
import { ACCEPT_ATTRIBUTE } from "./attachmentUpload";
import { macroEffect } from "./macroText";
import MacroPicker from "./MacroPicker";

type Mode = "reply" | "note";

/** What happens after the message is saved */
export type SendFollowUp = "none" | "wait";

/** Everything the composer hands over on send (POST /comments with the Sprint 2 extras) */
export interface ComposerMessage {
  body: string;
  internal: boolean;
  /** "wait": the send menu's "Send and set Waiting on employee" */
  followUp: SendFollowUp;
  /** S7: the macro that filled the box (its set_status applies unless followUp says otherwise) */
  macro: { id: number; title: string; setStatus: TicketStatus | null } | null;
  /** S14: uploaded, unsent files */
  attachmentIds: number[];
}

interface TicketComposerProps {
  ticket: Pick<
    Ticket,
    "ticket_id" | "title" | "requester_name" | "requester_email" | "assignee_name" | "assignee_email" | "department_name"
  >;
  permissions: TicketPermissions;
  /** Posts the comment; resolves true when it was saved so the box can clear */
  onSubmit: (message: ComposerMessage) => Promise<boolean>;
  /** Public replies allowed (GET /actions "reply"); default true */
  allowReply?: boolean;
  /** Internal notes allowed (GET /actions "internal_note"); default: staff */
  allowNote?: boolean;
  /** Offer "Send and set Waiting on employee" in the send menu (GET /actions "wait") */
  allowSendAndWait?: boolean;
  /** S7: the Macros button and "/" (staff of the ticket's department) */
  allowMacros?: boolean;
  /** S14: the paperclip and the drop zone */
  allowAttachments?: boolean;
  /** The signed-in agent's name, for the macro preview */
  agentName?: string | null;
  /** Why the composer is locked right now (e.g. the conversation didn't load); shown as the hint */
  disabledReason?: string | null;
  className?: string;
}

/**
 * Reply box (briefing p.42, p.48-49). Staff get two tabs, "Public reply" and "Internal note"; the
 * note turns the whole composer amber with a lock and says "Only staff can see this". The Send
 * button is split: its menu holds "Send and set Waiting on employee". Sprint 2: the Macros button
 * (or "/" in an empty box) opens the macro picker (S7), and files can be dropped, pasted or chosen,
 * each with its own progress, error and Internal switch (S14).
 */
export default function TicketComposer({
  ticket,
  permissions,
  onSubmit,
  allowReply = true,
  allowNote = permissions.canAddInternal,
  allowSendAndWait = false,
  allowMacros = permissions.isStaff,
  allowAttachments = true,
  agentName = null,
  disabledReason = null,
  className,
}: TicketComposerProps) {
  const locked = !!disabledReason;
  const [mode, setMode] = useState<Mode>(allowReply ? "reply" : "note");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<SendFollowUp | null>(null);
  const [macro, setMacro] = useState<ComposerMessage["macro"]>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inserting, setInserting] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const files = useComposerFiles(ticket.ticket_id);

  const internal = allowNote && (mode === "note" || !allowReply);
  const tabs = allowNote && allowReply;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const replyTo = permissions.isStaff
    ? firstNameOf(ticket.requester_name, "the requester")
    : ticket.assignee_name
      ? firstNameOf(ticket.assignee_name, "them")
      : `${ticket.department_name ?? "the"} team`;

  const hint = locked
    ? { icon: CircleAlert, text: disabledReason }
    : internal
    ? { icon: Lock, text: "Only staff can see this" }
    : permissions.isStaff
      ? ticket.requester_email
        ? { icon: Mail, text: `Emailed to ${replyTo}` }
        : { icon: MessageSquare, text: "Shown to the requester" }
      : ticket.assignee_email
        ? { icon: Mail, text: `Emailed to ${replyTo}` }
        : { icon: MessageSquare, text: `Shown to the ${ticket.department_name ?? "support"} team` };

  const submit = async (followUp: SendFollowUp = "none") => {
    const text = body.trim();
    if (!text || sending || locked || files.uploading) return;
    setSending(followUp);
    const ok = await onSubmit({
      body: text,
      internal,
      followUp: internal ? "none" : followUp,
      macro,
      attachmentIds: allowAttachments ? files.uploadedIds : [],
    });
    setSending(null);
    if (ok) {
      setBody("");
      setMacro(null);
      files.clear();
      if (allowReply) setMode("reply");
    }
  };

  const pickMacro = async (m: Macro) => {
    setInserting(m.id);
    try {
      const rendered = await renderMacro(m.id, ticket.ticket_id);
      setBody(rendered.body);
      setMacro({ id: m.id, title: m.title, setStatus: rendered.set_status });
      if (rendered.is_internal && allowNote) setMode("note");
      else if (!rendered.is_internal && allowReply) setMode("reply");
      setPickerOpen(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    } catch (err) {
      toast.error("Couldn't insert the macro", { description: toApiError(err).message });
    } finally {
      setInserting(null);
    }
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || !allowAttachments || locked) return;
    const incoming = Array.from(list);
    if (incoming.length) files.add(incoming, internal);
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const sendLabel = internal ? "Add note" : "Send reply";
  const splitSend = !internal && allowSendAndWait;
  const height = "h-10 sm:h-9";
  const cannotSend = locked || !!sending || !body.trim() || files.uploading;
  const showTray = allowAttachments && (files.files.length > 0 || dragging);

  const sendButton = splitSend ? (
    <ButtonGroup className="ml-auto">
      <Button type="submit" disabled={cannotSend} className={height}>
        {sending === "none" ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
        {sendLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            disabled={cannotSend}
            aria-label="More send options"
            className={cn(height, "w-9 border-l border-l-primary-foreground/20")}
          >
            {sending === "wait" ? <Spinner /> : <ChevronDown />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => void submit("wait")} className="gap-2.5 py-2">
            <Hourglass />
            <span className="flex flex-col">
              <span>Send and set Waiting on employee</span>
              <span className="text-xs text-muted-foreground">Use when you've asked {replyTo} something</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  ) : (
    <Button
      type="submit"
      disabled={cannotSend}
      className={cn("ml-auto", height, internal && "bg-warning-solid text-warning-foreground hover:bg-warning-solid/90")}
    >
      {sending ? <Spinner data-icon="inline-start" /> : internal ? <Lock data-icon="inline-start" /> : <Send data-icon="inline-start" />}
      {sendLabel}
    </Button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onDragEnter={(e) => {
        if (allowAttachments && !locked && hasFiles(e)) setDragging(true);
      }}
      onDragOver={(e) => {
        if (allowAttachments && !locked && hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
      aria-label={internal ? "Add an internal note" : "Send a reply"}
      className={cn(
        "flex flex-col rounded-xl border transition-colors focus-within:ring-3",
        internal
          ? "border-warning-border bg-warning-muted focus-within:ring-warning-border/40"
          : "border-border bg-background focus-within:border-ring focus-within:ring-ring/20",
        dragging && "border-primary ring-3 ring-primary/20",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-3 sm:px-4">
        {tabs ? (
          <Tabs value={mode} onValueChange={(v) => !locked && setMode(v as Mode)}>
            <TabsList
              aria-label="Reply or internal note"
              className={cn("group-data-horizontal/tabs:h-10 sm:group-data-horizontal/tabs:h-8", internal && "bg-warning-subtle")}
            >
              <TabsTrigger value="reply" className="px-3">
                Public reply
              </TabsTrigger>
              <TabsTrigger value="note" className="px-3 data-active:text-warning-strong">
                <Lock aria-hidden />
                Internal note
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <label htmlFor={id} className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
            {internal && <Lock className="size-3.5 text-warning-strong" aria-hidden />}
            {internal ? "Internal note" : "Reply"}
          </label>
        )}
        <span className={cn("flex items-center gap-1.5 px-1 text-xs", internal ? "font-medium text-warning-strong" : "text-muted-foreground")}>
          <hint.icon className="size-3.5" aria-hidden />
          {hint.text}
        </span>
      </div>

      {macro && (
        <div className="flex px-3 pt-3 sm:px-4">
          <Badge variant="secondary" className="h-7 max-w-full gap-1.5 rounded-lg pr-1 pl-2 text-xs font-normal">
            <Zap className="text-primary" aria-hidden />
            <span className="truncate font-medium text-foreground">{macro.title}</span>
            <span className="hidden shrink-0 text-muted-foreground sm:inline">· {followUpLabel(macro.setStatus)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setMacro(null)}
              aria-label="Don't use this macro (keeps the text, no status change)"
              className="size-5 text-muted-foreground"
            >
              <X />
            </Button>
          </Badge>
        </div>
      )}

      <Textarea
        id={id}
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
          // "/" in an empty box opens the macro picker (p.49)
          if (e.key === "/" && allowMacros && !locked && body.trim() === "") {
            e.preventDefault();
            setPickerOpen(true);
          }
        }}
        onPaste={(e) => {
          if (e.clipboardData.files.length > 0 && allowAttachments) {
            e.preventDefault();
            addFiles(e.clipboardData.files);
          }
        }}
        rows={4}
        maxLength={5000}
        disabled={locked}
        aria-label={tabs ? (internal ? "Internal note" : "Public reply") : undefined}
        placeholder={
          internal
            ? `Write a note for the team. The requester never sees it.${allowMacros ? " Type / for macros." : ""}`
            : permissions.isStaff
              ? `Reply to ${replyTo}…${allowMacros ? " Type / for macros." : ""}`
              : `Add a reply for ${replyTo}…`
        }
        className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0 sm:px-5 dark:bg-transparent"
      />

      {showTray && (
        <ComposerAttachments
          files={files.files}
          onRemove={files.remove}
          onInternalChange={files.setInternal}
          perFileInternal={permissions.isStaff && !internal}
          allInternal={internal}
          onBrowse={() => fileInputRef.current?.click()}
          dragging={dragging}
          disabled={locked || !!sending}
        />
      )}

      <div className="flex items-center justify-between gap-2 px-3 pb-3 sm:px-4">
        <div className="flex items-center gap-1">
          {allowMacros && (
            <MacroPicker
              open={pickerOpen}
              onOpenChange={(open) => !locked && setPickerOpen(open)}
              ticket={ticket}
              agentName={agentName}
              inserting={inserting}
              onPick={(m) => void pickMacro(m)}
              trigger={
                <Button type="button" variant="secondary" size="sm" disabled={locked} className="h-10 sm:h-8">
                  <Zap data-icon="inline-start" className="text-primary" />
                  Macros
                </Button>
              }
            />
          )}
          {allowAttachments && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={locked || !!sending}
                    aria-label="Attach files"
                    className="size-10 text-muted-foreground sm:size-8"
                  >
                    <Paperclip />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files (up to 5, 5 MB each)</TooltipContent>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
          <span className="ml-2 hidden items-center gap-1 text-xs text-muted-foreground md:flex">
            {files.uploading ? (
              <>
                <Spinner className="size-3" />
                Uploading…
              </>
            ) : (
              <>
                <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>Enter</Kbd>
                <span className="ml-1">to send</span>
              </>
            )}
          </span>
        </div>
        {sendButton}
      </div>
    </form>
  );
}

const followUpLabel = (status: TicketStatus | null) => macroEffect(status);
