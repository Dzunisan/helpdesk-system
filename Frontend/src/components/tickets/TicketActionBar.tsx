import type { ReactNode } from "react";
import { Ban, Check, CircleCheck, Lock, RotateCcw, UserPlus, X } from "lucide-react";
import type { Ticket } from "@/types/ticket.types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { displayStatus, type TicketPermissions } from "./ticketDetail";

interface TicketActionBarProps {
  ticket: Ticket;
  permissions: TicketPermissions;
  busy: boolean;
  /** Which action is running, so only that button shows a spinner */
  pending?: string | null;
  onAssignToMe: () => void;
  onStatusChange: (status: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onCancelRequest: () => void;
}

// 40px tap targets on phones, the normal 36px from sm up
const TAP = "h-10 sm:h-9";

/**
 * Only the moves this user can make on this ticket right now (briefing p.48 "action bar with
 * only valid moves"). Returns null when there is nothing to do.
 */
export default function TicketActionBar({
  ticket,
  permissions,
  busy,
  pending,
  onAssignToMe,
  onStatusChange,
  onApprove,
  onReject,
  onCancelRequest,
}: TicketActionBarProps) {
  const raw = (ticket.ticket_status ?? "").toLowerCase();
  const status = displayStatus(ticket);
  const buttons: ReactNode[] = [];

  const icon = (key: string, Icon: typeof Check) =>
    pending === key ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />;

  if (permissions.canApproveReject && status === "pending") {
    buttons.push(
      <Button key="reject" variant="outline" className={TAP} disabled={busy} onClick={onReject}>
        {icon("reject", X)}
        Reject
      </Button>,
      <Button key="approve" className={TAP} disabled={busy} onClick={onApprove}>
        {icon("approve", Check)}
        Approve
      </Button>,
    );
  }

  if (permissions.canChangeStatus) {
    // Legacy "Open" = nobody owns it yet (shown as New)
    if (raw === "open")
      buttons.push(
        <Button key="assign" className={TAP} disabled={busy} onClick={onAssignToMe}>
          {icon("assign", UserPlus)}
          Assign to me
        </Button>,
      );
    if (raw === "in progress")
      buttons.push(
        <Button key="resolve" className={TAP} disabled={busy} onClick={() => onStatusChange("Resolved")}>
          {icon("Resolved", CircleCheck)}
          Resolve
        </Button>,
      );
    if (raw === "resolved" || raw === "closed" || raw === "cancelled")
      buttons.push(
        <Button key="reopen" variant="outline" className={TAP} disabled={busy} onClick={() => onStatusChange("In progress")}>
          {icon("In progress", RotateCcw)}
          Reopen
        </Button>,
      );
    if (raw === "resolved")
      buttons.push(
        <Button key="close" className={TAP} disabled={busy} onClick={() => onStatusChange("Closed")}>
          {icon("Closed", Lock)}
          Close ticket
        </Button>,
      );
  }

  // The requester may withdraw a request nobody has started on yet
  if (!permissions.isStaff && permissions.isRequester && (status === "new" || status === "pending")) {
    buttons.push(
      <Button key="cancel" variant="outline" className={TAP} disabled={busy} onClick={onCancelRequest}>
        {icon("Cancelled", Ban)}
        Cancel request
      </Button>,
    );
  }

  if (buttons.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
}
