import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import type { Ticket, TimelineEvent, TimelineItem } from "@/types/api";
import { formatAge, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { leadTitle } from "@/components/request/useDepartmentLead";

interface ApprovalBannerProps {
  ticket: Ticket;
  /** The public timeline: the decision and its reason come from the `approved` / `rejected` event */
  items: TimelineItem[] | null;
  /** The department lead: "Thandi Mthembu" (null when unknown) */
  approverName: string | null;
  className?: string;
}

/** The latest approval decision on the request, if any */
function approvalDecision(items: TimelineItem[] | null): TimelineEvent | null {
  if (!items) return null;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === "event" && (item.type === "approved" || item.type === "rejected")) return item;
  }
  return null;
}

/**
 * The approval state on the employee's request page (S6, briefing p.15 step 5): a violet "Waiting
 * for Thandi Mthembu's approval" banner while pending, then the decision and the reason in plain words.
 * Renders nothing for requests that never needed approval.
 */
export default function ApprovalBanner({ ticket, items, approverName, className }: ApprovalBannerProps) {
  const decision = approvalDecision(items);
  const team = ticket.department_name ?? "the team";

  if (ticket.ticket_status === "Pending approval") {
    const who = approverName ?? `the ${team} lead`;
    return (
      <Alert className={cn("border-pending-border bg-pending-muted px-5 py-4 text-foreground *:[svg]:text-pending", className)}>
        <Hourglass aria-hidden />
        <AlertTitle className="text-base font-semibold text-pending-strong">Waiting for {who}'s approval</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          {approverName ? `${approverName} is the ${leadTitle(ticket.department_name)} and usually decides` : "The lead usually decides"} within 1 working
          day. You'll see the decision and the reason here, and we'll email you.{" "}
          {formatAge(ticket.created_at) === "just now" ? "Sent just now." : `Waiting ${formatAge(ticket.created_at)} so far.`}
        </AlertDescription>
      </Alert>
    );
  }

  if (!decision) return null;
  const who = decision.actor?.name ?? approverName ?? `The ${team} lead`;
  const approved = decision.type === "approved";
  const when = formatSast(decision.at);

  return (
    <Alert
      className={cn(
        "px-5 py-4 text-foreground",
        approved
          ? "border-success-border bg-success-muted *:[svg]:text-success"
          : "border-destructive/30 bg-destructive/5 *:[svg]:text-destructive",
        className,
      )}
    >
      {approved ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
      <AlertTitle className="text-base font-semibold">
        {approved ? `Approved by ${who}` : `Declined by ${who}`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span>
          {when}.{" "}
          {approved
            ? `${team} has it now and the reply clock started at approval.`
            : "This request is closed. You can start a new one if something changes."}
        </span>
        {decision.note && (
          <blockquote className="border-l-2 border-border pl-3 wrap-break-word whitespace-pre-wrap text-foreground">
            <span className="sr-only">{approved ? "Note: " : "Reason: "}</span>
            {decision.note}
          </blockquote>
        )}
      </AlertDescription>
    </Alert>
  );
}
