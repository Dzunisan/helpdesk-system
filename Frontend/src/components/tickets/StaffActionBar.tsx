import type { ReactNode } from "react";
import { Ban, Check, CircleCheck, Hourglass, RotateCcw, RotateCw, UserCheck, UserRoundPlus, X } from "lucide-react";
import type { Ticket, TicketAction, TicketActionsResponse, TicketStatus } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import AssignMenu from "@/components/queue/AssignMenu";
import type { Assignee } from "@/components/queue/useClaim";
import type { TeamMember } from "@/components/queue/useTeam";

export type ActionKey = TicketAction | "send";

interface StaffActionBarProps {
  ticket: Ticket;
  /** GET /api/tickets/:id/actions; null while loading */
  actions: TicketActionsResponse | null;
  actionsError: string | null;
  onRetry: () => void;
  /** The action that is running (its button shows a spinner; the rest are disabled) */
  pending: ActionKey | null;
  onClaim: () => void;
  onTransition: (to: TicketStatus, key: TicketAction) => void;
  /** Opens the resolution-note dialog */
  onResolve: () => void;
  onApprove: () => void;
  onReject: () => void;
  /** Lead: the team with each person's load, for Assign / Reassign */
  team: { members: TeamMember[]; loading: boolean; error: boolean };
  currentUserId: string;
  onAssign: (assignee: Assignee) => void;
}

const TAP = "h-10 sm:h-8";

/**
 * Only the buttons GET /actions returns (briefing p.11, p.48 "action bar with only valid moves").
 * Priority lives in the properties panel and replies in the composer, so `change_priority`,
 * `reply` and `internal_note` render nothing here.
 */
export default function StaffActionBar({
  ticket,
  actions,
  actionsError,
  onRetry,
  pending,
  onClaim,
  onTransition,
  onResolve,
  onApprove,
  onReject,
  team,
  currentUserId,
  onAssign,
}: StaffActionBarProps) {
  if (actionsError) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Couldn't load what you can do here.
        <Button variant="outline" size="sm" onClick={onRetry} className={TAP}>
          <RotateCw data-icon="inline-start" />
          Try again
        </Button>
      </p>
    );
  }
  if (!actions) {
    return (
      <div className="flex gap-2" aria-busy="true" aria-label="Loading actions">
        <Skeleton className="h-8 w-36 bg-foreground/[0.07]" />
        <Skeleton className="h-8 w-24 bg-foreground/[0.07]" />
      </div>
    );
  }

  const has = (a: TicketAction) => actions.actions.includes(a);
  const busy = pending !== null;
  const icon = (key: ActionKey, Icon: typeof Check) =>
    pending === key ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />;
  // One default (indigo) button per view (p.32): the main move for this status
  const primary: TicketAction | undefined = (["claim", "resolve", "approve", "confirm_fixed"] as TicketAction[]).find(has);
  const variant = (a: TicketAction) => (a === primary ? "default" : "outline");

  const buttons: ReactNode[] = [];
  if (has("claim"))
    buttons.push(
      <Button key="claim" variant={variant("claim")} className={TAP} disabled={busy} onClick={onClaim}>
        {icon("claim", UserCheck)}
        Claim
      </Button>,
    );
  if (has("reject"))
    buttons.push(
      <Button key="reject" variant="outline" className={TAP} disabled={busy} onClick={onReject}>
        {icon("reject", X)}
        Reject
      </Button>,
    );
  if (has("approve"))
    buttons.push(
      <Button key="approve" variant={variant("approve")} className={TAP} disabled={busy} onClick={onApprove}>
        {icon("approve", Check)}
        Approve
      </Button>,
    );
  if (has("wait"))
    buttons.push(
      <Button key="wait" variant="outline" className={TAP} disabled={busy} onClick={() => onTransition("Waiting on employee", "wait")}>
        {icon("wait", Hourglass)}
        Waiting on employee
      </Button>,
    );
  if (has("resume"))
    buttons.push(
      <Button key="resume" variant="outline" className={TAP} disabled={busy} onClick={() => onTransition("Open", "resume")}>
        {icon("resume", RotateCcw)}
        Back to open
      </Button>,
    );
  if (has("resolve"))
    buttons.push(
      <Button key="resolve" variant={variant("resolve")} className={TAP} disabled={busy} onClick={onResolve}>
        {icon("resolve", Check)}
        Resolve
      </Button>,
    );
  if (has("confirm_fixed"))
    buttons.push(
      <Button key="confirm" variant={variant("confirm_fixed")} className={TAP} disabled={busy} onClick={() => onTransition("Closed", "confirm_fixed")}>
        {icon("confirm_fixed", CircleCheck)}
        Yes, it's fixed
      </Button>,
    );
  if (has("still_broken"))
    buttons.push(
      <Button key="broken" variant="outline" className={TAP} disabled={busy} onClick={() => onTransition("Open", "still_broken")}>
        {icon("still_broken", RotateCcw)}
        Still broken
      </Button>,
    );
  if (has("assign"))
    buttons.push(
      <AssignMenu
        key="assign"
        ticket={ticket}
        members={team.members}
        membersLoading={team.loading}
        membersError={team.error}
        currentUserId={currentUserId}
        onAssign={onAssign}
        align="start"
        trigger={
          <Button variant="ghost" className={TAP} disabled={busy}>
            {icon("assign", UserRoundPlus)}
            {ticket.assignee_id ? "Reassign" : "Assign"}
          </Button>
        }
      />,
    );
  if (has("cancel"))
    buttons.push(
      <Button key="cancel" variant="ghost" className={TAP} disabled={busy} onClick={() => onTransition("Cancelled", "cancel")}>
        {icon("cancel", Ban)}
        Cancel request
      </Button>,
    );

  if (buttons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {ticket.ticket_status === "Closed" || ticket.ticket_status === "Cancelled"
          ? "This ticket is final. It can't change any more."
          : "Nothing for you to do here right now."}
      </p>
    );
  }
  return (
    <div role="toolbar" aria-label="Ticket actions" className="flex flex-wrap items-center gap-2">
      {buttons}
    </div>
  );
}
