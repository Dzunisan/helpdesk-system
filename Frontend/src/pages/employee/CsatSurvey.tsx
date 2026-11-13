import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CircleCheck, FileQuestion, Heart, Hourglass, MessageCircleHeart, Send } from "lucide-react";
import { getTicket } from "@/services/tickets";
import { getTicketFeedback, submitCsat } from "@/services/feedback";
import { toApiError } from "@/services/apiClient";
import { CSAT_TAGS, type CsatTag, type Ticket, type TicketFeedback } from "@/types/api";
import { firstNameOf, formatDurationWords, formatSast, formatTicketRef } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { useApiData } from "@/hooks/useApiData";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import KeyValueList from "@/components/app/KeyValueList";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import StarRating, { StarsShown } from "@/components/feedback/StarRating";
import { ratingWord } from "@/components/feedback/csat";
import { RatingCard } from "@/components/feedback/CsatPrompt";
import { leadTitle, useDepartmentLead } from "@/components/request/useDepartmentLead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const COMMENT_MAX = 2000;
const GRID = "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]";

/** "open for 5 h 41 min": from submitted to resolved (or closed) */
function openFor(ticket: Ticket): string | null {
  const end = ticket.resolved_at ?? ticket.closed_at;
  if (!end) return null;
  const mins = (new Date(end).getTime() - new Date(ticket.created_at).getTime()) / 60_000;
  return Number.isFinite(mins) && mins >= 0 ? formatDurationWords(mins) : null;
}

/**
 * CSAT survey (S10, briefing p.19, p.43) at /employee/tickets/:id/feedback: reached from the
 * "How did we do?" notification and email, or the stars on a closed request. Big stars with a word,
 * optional quick tags and a comment, the agent by name. One rating per request: opening the link
 * again shows the rating already given.
 */
export default function CsatSurvey() {
  const { id } = useParams();
  const ticketId = Number(id);
  const valid = Number.isInteger(ticketId) && ticketId > 0;

  const ticketQ = useApiData(() => getTicket(ticketId), `ticket-${ticketId}`);
  const feedbackQ = useApiData(() => getTicketFeedback(ticketId), `feedback-${ticketId}`);
  const ticket = ticketQ.data;
  const leadName = useDepartmentLead(ticket?.ticket_department_id);
  const { user } = useAuth();
  const firstName = firstNameOf(user?.name);

  const back = {
    to: valid ? `/employee/tickets/${ticketId}` : "/employee/my-requests",
    label: valid ? formatTicketRef(ticketId) : "My requests",
  };

  if (!valid || ticketQ.error?.isNotFound) {
    return (
      <EmptyState
        variant="card"
        icon={FileQuestion}
        title="Request not found"
        description="It doesn't exist, or it isn't one of yours. Check the link in the email."
        action={
          <Button asChild>
            <Link to="/employee/my-requests">Back to my requests</Link>
          </Button>
        }
      />
    );
  }

  if (ticketQ.loading || feedbackQ.loading) return <SurveySkeleton />;

  if (!ticket || (feedbackQ.error && feedbackQ.data === null)) {
    const retry = () => {
      if (!ticket) ticketQ.reload();
      feedbackQ.reload();
    };
    return (
      <div className="flex flex-col gap-8">
        <PageHeader back={back} title="How did we do?" />
        <ErrorState title="Couldn't load the survey" onRetry={retry} retrying={ticketQ.refreshing || feedbackQ.refreshing} />
      </div>
    );
  }

  const existing = feedbackQ.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        back={back}
        eyebrow={<span className="truncate">{ticket.title}</span>}
        title={`How did we do${firstName ? `, ${firstName}` : ""}?`}
        description={`One quick rating for ${ticket.department_name ?? "the team"}. It takes ten seconds.`}
      />

      <div className={GRID}>
        {existing ? (
          <AlreadyRated ticket={ticket} feedback={existing} />
        ) : ticket.ticket_status !== "Closed" ? (
          <NotYet ticket={ticket} />
        ) : (
          <SurveyForm
            ticket={ticket}
            leadName={leadName}
            onRated={(feedback) => feedbackQ.setData(feedback)}
            onAlreadyRated={() => feedbackQ.reload()}
            onNotClosed={() => ticketQ.reload()}
          />
        )}

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24" aria-label="About this survey">
          <SectionCard title="Who reads this">
            <div className="flex flex-col gap-4">
              {ticket.assignee_name && (
                <UserAvatar name={ticket.assignee_name} showName description={`Worked on this · ${ticket.department_name ?? ""}`} />
              )}
              <UserAvatar
                name={leadName ?? `${ticket.department_name ?? "Department"} lead`}
                showName
                description={`${leadTitle(ticket.department_name)} · reads every low score`}
              />
            </div>
          </SectionCard>
          <SectionCard title="About this request">
            <KeyValueList
              items={[
                { label: "Reference", value: <TicketRef id={ticket.ticket_id} className="text-sm text-foreground" /> },
                { label: "Category", value: <span className="truncate">{ticket.category_name ?? "—"}</span> },
                { label: "Submitted", value: formatSast(ticket.created_at) },
                { label: "Resolved", value: formatSast(ticket.resolved_at) },
              ]}
            />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}

function SurveyForm({
  ticket,
  leadName,
  onRated,
  onAlreadyRated,
  onNotClosed,
}: {
  ticket: Ticket;
  leadName: string | null;
  onRated: (feedback: TicketFeedback) => void;
  onAlreadyRated: () => void;
  onNotClosed: () => void;
}) {
  const [params] = useSearchParams();
  const preset = Number(params.get("rating"));
  const [rating, setRating] = useState(Number.isInteger(preset) && preset >= 1 && preset <= 5 ? preset : 0);
  const [tags, setTags] = useState<CsatTag[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [missing, setMissing] = useState(false);

  const agent = ticket.assignee_name;
  const agentFirst = agent ? firstNameOf(agent) : null;
  const team = ticket.department_name ?? "the team";
  const duration = openFor(ticket);
  const low = rating > 0 && rating <= 2;
  const tooLong = comment.trim().length > COMMENT_MAX;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rating < 1) {
      setMissing(true);
      return;
    }
    if (tooLong || sending) return;
    setSending(true);
    try {
      const feedback = await submitCsat(ticket.ticket_id, {
        rating,
        tags: tags.length ? tags : undefined,
        comment: comment.trim() || undefined,
      });
      toast.success("Thanks for the feedback");
      onRated(feedback);
    } catch (error) {
      const apiError = toApiError(error, "Couldn't send your rating.");
      if (apiError.isConflict) {
        toast.info("Thanks, you already rated this", { description: apiError.message });
        onAlreadyRated();
        onNotClosed();
      } else {
        toast.error("Couldn't send your rating", { description: apiError.message });
      }
      setSending(false);
    }
  };

  return (
    <SectionCard>
      <form onSubmit={submit} noValidate aria-label="Rate this request" className="flex flex-col gap-7">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <UserAvatar name={agent ?? team} className="shrink-0" />
          <p className="min-w-0 pt-1.5">
            {agent ? (
              <span className="font-medium text-foreground">{agent}</span>
            ) : (
              <span className="font-medium text-foreground">{team}</span>
            )}
            {agent && ` from ${team}`} resolved this{ticket.resolved_at && ` on ${formatSast(ticket.resolved_at, "day")}`}
            {duration && ` · open for ${duration}`}
          </p>
        </div>

        <Field data-invalid={missing && rating === 0 ? true : undefined}>
          <FieldLabel id="csat-stars-label" className="sr-only">
            Your rating
          </FieldLabel>
          <StarRating
            size="lg"
            value={rating}
            onChange={(next) => {
              setRating(next);
              setMissing(false);
            }}
            disabled={sending}
            aria-labelledby="csat-stars-label"
          />
          {missing && rating === 0 && <p className="text-xs text-destructive">Tap a star to choose your rating.</p>}
        </Field>

        {low && (
          <Alert className="border-warning-border bg-warning-muted px-4 py-3 text-foreground">
            <MessageCircleHeart className="text-warning" aria-hidden />
            <AlertDescription className="text-sm text-warning-strong">
              Sorry it wasn't great. <span className="font-semibold">{leadName ?? `The ${team} lead`}</span>, the{" "}
              {leadTitle(ticket.department_name)}, reads every low score and may contact you.
            </AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel id="csat-tags-label">
            What went well? <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            spacing={2}
            value={tags}
            onValueChange={(next) => setTags(next as CsatTag[])}
            disabled={sending}
            aria-labelledby="csat-tags-label"
            className="flex-wrap"
          >
            {CSAT_TAGS.map((tag) => (
              <ToggleGroupItem
                key={tag}
                value={tag}
                className="h-9 rounded-full px-4 text-sm data-[state=on]:border-primary/40 data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
              >
                {tag}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field data-invalid={tooLong ? true : undefined}>
          <FieldLabel htmlFor="csat-comment">
            Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id="csat-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={sending}
            placeholder={
              agentFirst ? `What ${agentFirst} did well, or what could have been better` : "What went well, or what could have been better"
            }
            aria-invalid={tooLong ? true : undefined}
            className="min-h-28 resize-y"
          />
          {tooLong && (
            <FieldDescription className="text-xs text-destructive">
              {comment.trim().length - COMMENT_MAX} characters too long.
            </FieldDescription>
          )}
        </Field>

        <Separator />

        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            You can rate each request once. {agentFirst ? `${agentFirst} and the ` : "The "}
            {leadTitle(ticket.department_name)} will see this.
          </p>
          <Button type="submit" size="lg" disabled={sending || tooLong} className="h-11 w-full shrink-0 sm:h-10 sm:w-auto">
            {sending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Send feedback
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** Opening the link again (or just after sending): the rating already given, never a second form */
function AlreadyRated({ ticket, feedback }: { ticket: Ticket; feedback: TicketFeedback }) {
  const team = ticket.department_name ?? "the team";
  return (
    <div className="flex flex-col gap-6">
      <SectionCard contentClassName="flex flex-col items-center gap-4 py-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-muted text-success">
          <Heart className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Thanks for the feedback</h2>
          <p className="text-sm text-muted-foreground">
            You rated this {feedback.rating} {feedback.rating === 1 ? "star" : "stars"} ({ratingWord(feedback.rating).toLowerCase()}) on{" "}
            {formatSast(feedback.created_at, "day")}. It helps {team} get better.
          </p>
        </div>
        <StarsShown value={feedback.rating} size="lg" />
        <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row">
          <Button asChild variant="outline" className="h-11 sm:h-9">
            <Link to={`/employee/tickets/${ticket.ticket_id}`}>
              <ArrowLeft data-icon="inline-start" />
              Back to the request
            </Link>
          </Button>
          <Button asChild className="h-11 sm:h-9">
            <Link to="/employee/my-requests">My requests</Link>
          </Button>
        </div>
      </SectionCard>
      <RatingCard feedback={feedback} title="What you told us" />
      <p className="text-xs text-muted-foreground">You can rate each request once, so this rating can't be changed.</p>
    </div>
  );
}

/** The survey opens once the request is closed: Resolved still needs "Yes, it's fixed" */
function NotYet({ ticket }: { ticket: Ticket }) {
  const resolved = ticket.ticket_status === "Resolved";
  const cancelled = ticket.ticket_status === "Cancelled";
  return (
    <EmptyState
      variant="card"
      icon={resolved ? CircleCheck : Hourglass}
      title={resolved ? "Confirm it's fixed first" : cancelled ? "Nothing to rate" : "Not ready to rate yet"}
      description={
        resolved
          ? "Tell us whether it works on the request page. Once it's closed you can rate the help you got."
          : cancelled
            ? "This request was cancelled, so there's no help to rate."
            : "You can rate a request once it's closed. We'll send you this survey then."
      }
      action={
        <Button asChild>
          <Link to={`/employee/tickets/${ticket.ticket_id}`}>Open the request</Link>
        </Button>
      }
    />
  );
}

function SurveySkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className={GRID}>
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-background p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-12 w-72 max-w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
