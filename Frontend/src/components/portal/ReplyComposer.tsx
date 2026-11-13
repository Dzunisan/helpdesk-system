import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const MAX = 5000;

interface ReplyComposerProps {
  /** "Thabo" -> "Reply to Thabo…" */
  replyTo?: string | null;
  /** The team is waiting on the employee: say so and draw the eye */
  waiting?: boolean;
  /** Focus and scroll into view on arrival (the "Reply" button on My requests) */
  focusOnMount?: boolean;
  /** Resolves true when sent, so the box can clear */
  onSend: (body: string) => Promise<boolean>;
  className?: string;
}

/** The employee's reply box under the timeline (briefing p.41). Ctrl/Cmd + Enter sends. */
export default function ReplyComposer({ replyTo, waiting, focusOnMount, onSend, className }: ReplyComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX;

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || tooLong || sending) return;
    setSending(true);
    const ok = await onSend(trimmed);
    setSending(false);
    if (ok) setBody("");
  };

  return (
    <form
      id="reply"
      onSubmit={send}
      aria-label="Reply"
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-xl border bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        waiting ? "border-warning-border" : "border-input",
        className,
      )}
    >
      {waiting && (
        <p className="border-b border-warning-border bg-warning-muted px-4 py-2 text-xs font-medium text-warning-strong">
          {replyTo ?? "The team"} is waiting for your answer. Replying moves the request back to them.
        </p>
      )}
      <Textarea
        ref={ref}
        aria-label={replyTo ? `Reply to ${replyTo}` : "Your reply"}
        placeholder={replyTo ? `Reply to ${replyTo}…` : "Add details or ask a question…"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        disabled={sending}
        className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2.5">
        <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {tooLong ? `${trimmed.length - MAX} characters too long` : "The team sees it straight away."}
        </p>
        <Button type="submit" disabled={!trimmed || tooLong || sending} className="h-10 sm:h-9">
          {sending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          Send reply
        </Button>
      </div>
    </form>
  );
}
