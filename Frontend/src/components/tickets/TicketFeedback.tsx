import { useState } from "react";
import { Star } from "lucide-react";
import type { Ticket, TicketFeedback } from "@/types/ticket.types";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import SectionCard from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { firstName } from "./ticketDetail";

const RATING_WORD = ["", "Poor", "Fair", "Okay", "Good", "Great"] as const;

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-4", n <= value ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}

interface FeedbackFormProps {
  ticket: Ticket;
  onSubmit: (rating: number, comment: string) => Promise<boolean>;
}

/** "How did Thabo do?" for the requester once a ticket is resolved or closed (briefing p.45) */
export function FeedbackForm({ ticket, onSubmit }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const shown = hover || rating;
  const who = ticket.assignee_name ? firstName(ticket.assignee_name) : (ticket.department_name ?? "the team");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || sending) return;
    setSending(true);
    await onSubmit(rating, comment.trim());
    setSending(false);
  };

  return (
    <SectionCard
      title={`How did ${who} do?`}
      description="Your rating helps the team get better. It takes ten seconds."
      className="border-primary/25"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="radiogroup" aria-label="Rating" className="-ml-2 flex items-center" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}, ${RATING_WORD[n].toLowerCase()}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className="flex size-11 items-center justify-center rounded-lg transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Star
                  aria-hidden
                  className={cn(
                    "size-7 transition-transform",
                    n <= shown ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40",
                    n === hover && "scale-110",
                  )}
                />
              </button>
            ))}
          </div>
          <span className="min-w-12 text-sm font-medium text-foreground" aria-live="polite">
            {shown ? RATING_WORD[shown] : <span className="font-normal text-muted-foreground">Tap a star</span>}
          </span>
        </div>

        <Field>
          <FieldLabel htmlFor="feedback-comment">
            Anything to add? <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id="feedback-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went well, or what could have been better"
            className="min-h-20 resize-none"
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" disabled={sending || rating === 0} className="h-10 w-full sm:h-9 sm:w-auto">
            {sending && <Spinner data-icon="inline-start" />}
            Send rating
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** The submitted rating, shown in the side column to everyone who can see the ticket */
export function FeedbackSummary({ feedback, isMine }: { feedback: TicketFeedback; isMine: boolean }) {
  return (
    <SectionCard title={isMine ? "Your rating" : "Rating"}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Stars value={feedback.rating} />
          <span className="text-sm font-medium tabular-nums">{RATING_WORD[feedback.rating] ?? `${feedback.rating}/5`}</span>
        </div>
        {feedback.comment && (
          <blockquote className="border-l-2 border-border pl-3 text-sm break-words whitespace-pre-wrap text-foreground">
            {feedback.comment}
          </blockquote>
        )}
        <p className="text-xs text-muted-foreground">
          {isMine ? "Sent" : `From ${feedback.user_name || "the requester"}`} · {formatSast(feedback.created_at, "smart")}
        </p>
      </div>
    </SectionCard>
  );
}

/** Staff side card while the requester hasn't rated a resolved ticket yet */
export function FeedbackAwaiting({ requesterName }: { requesterName: string | null | undefined }) {
  return (
    <SectionCard title="Rating">
      <div className="flex items-center gap-2.5">
        <Stars value={0} />
        <span className="text-sm text-muted-foreground">Not rated yet</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {firstName(requesterName, "The requester")} can rate this now that it's resolved.
      </p>
    </SectionCard>
  );
}
