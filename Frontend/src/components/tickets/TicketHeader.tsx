import type { ReactNode } from "react";
import { Users } from "lucide-react";
import type { Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { displayStatus, type TicketPermissions } from "./ticketDetail";

interface TicketHeaderProps {
  ticket: Ticket;
  permissions: TicketPermissions;
  back: { to: string; label: string };
  /** The ActionBar: only the moves this user may make right now */
  actions?: ReactNode;
}

/** Ref, status, title and, in plain words, who is working on it (briefing p.41, p.48) */
export default function TicketHeader({ ticket, permissions, back, actions }: TicketHeaderProps) {
  const department = ticket.department_name;
  const category = ticket.category_name ?? ticket.request_type_name;

  return (
    <PageHeader
      back={back}
      eyebrow={
        <>
          <TicketRef id={ticket.ticket_id} />
          <StatusBadge status={ticket.ticket_status} />
          {(department || category) && (
            <span className="truncate">
              {[department, category].filter(Boolean).join(" · ")}
            </span>
          )}
        </>
      }
      title={<span className="break-words">{ticket.title}</span>}
      description={<WhoIsOnIt ticket={ticket} permissions={permissions} />}
      actions={actions}
      // Actions sit level with the title block rather than the back link
      className="sm:items-center"
    />
  );
}

function WhoIsOnIt({ ticket, permissions }: { ticket: Ticket; permissions: TicketPermissions }) {
  const status = displayStatus(ticket);
  const team = ticket.department_name ?? "the team";
  const assignee = ticket.assignee_name?.trim();
  const isMine = !!ticket.assignee_id && String(ticket.assignee_id) === permissions.userId;

  if (assignee && status !== "cancelled") {
    const done = status === "resolved" || status === "closed";
    let text: ReactNode;
    if (isMine) text = done ? "You handled this" : "You're working on this";
    else if (!permissions.isStaff)
      text = (
        <>
          <span className="font-medium text-foreground">{assignee}</span> from {team}{" "}
          {done ? "handled this" : "is working on this"}
        </>
      );
    else
      text = (
        <>
          <span className="font-medium text-foreground">{assignee}</span> {done ? "handled this" : "is working on this"}
        </>
      );
    return (
      <span className="mt-1 flex items-center gap-2">
        <UserAvatar name={assignee} size="sm" />
        <span className="min-w-0">{text}</span>
      </span>
    );
  }

  let text: string;
  if (status === "cancelled") text = "This request was cancelled.";
  else if (status === "pending")
    text = permissions.canApproveReject
      ? "Waiting for your approval before an agent picks it up."
      : permissions.isStaff
        ? "Waiting for the department lead's approval."
        : `Waiting for the ${team} lead to approve it.`;
  else if (status === "new")
    text = permissions.isStaff ? "Nobody has picked this up yet." : `Waiting for someone in ${team} to pick this up.`;
  else text = "Not assigned to anyone yet.";

  return (
    <span className="mt-1 flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      <span className="min-w-0">{text}</span>
    </span>
  );
}
