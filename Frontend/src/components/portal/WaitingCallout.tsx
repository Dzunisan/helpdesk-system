import { Link } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import { getTimeline } from "@/services/tickets";
import type { Ticket, TimelineComment } from "@/types/api";
import { formatTicketRef } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiData } from "./useApiData";
import { firstNameOf } from "./portalText";

interface WaitingCalloutProps {
  /** The most recent request that is Waiting on employee */
  ticket: Ticket;
  /** How many requests are waiting in total */
  total: number;
  /** Switch My requests to the "Waiting on you" tab */
  onShowAll: () => void;
}

/**
 * The amber "Thabo needs a reply from you on HD-1041" callout on My requests (briefing p.37),
 * quoting the team's last public message, with a Reply button straight into the reply box.
 */
export default function WaitingCallout({ ticket, total, onShowAll }: WaitingCalloutProps) {
  const timeline = useApiData(() => getTimeline(ticket.ticket_id), `timeline-${ticket.ticket_id}`);
  const lastQuestion = [...(timeline.data?.items ?? [])]
    .reverse()
    .find(
      (item): item is TimelineComment =>
        item.kind === "comment" && !!item.body && item.actor.user_id !== String(ticket.requester_id),
    );

  const asker = lastQuestion?.actor.name ?? ticket.assignee_name;
  const who = asker ? firstNameOf(asker) : `${ticket.department_name ?? "The team"}`;
  const more = total - 1;

  return (
    <Alert className="flex flex-col gap-4 rounded-xl border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
          <MessageSquareText className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <AlertTitle className="font-semibold">
            {who} needs a reply from you on {formatTicketRef(ticket.ticket_id)}
          </AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-100/80">
            {lastQuestion?.body ? (
              <span className="line-clamp-2">“{lastQuestion.body}”</span>
            ) : (
              <span className="line-clamp-1">{ticket.title}</span>
            )}
            {more > 0 && (
              <Button
                variant="link"
                onClick={onShowAll}
                className="h-auto p-0 text-sm font-medium text-amber-900 underline dark:text-amber-100"
              >
                {more === 1 ? "1 more request is waiting on you" : `${more} more requests are waiting on you`}
              </Button>
            )}
          </AlertDescription>
        </div>
      </div>
      <Button
        asChild
        variant="outline"
        className="ml-12 h-10 shrink-0 self-start border-amber-300 bg-background hover:bg-amber-100 sm:ml-0 sm:self-auto sm:h-9"
      >
        <Link to={`/employee/tickets/${ticket.ticket_id}?reply=1`}>Reply</Link>
      </Button>
    </Alert>
  );
}
