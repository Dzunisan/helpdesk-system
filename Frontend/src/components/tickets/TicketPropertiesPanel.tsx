import { Users } from "lucide-react";
import type { AgentUser, Ticket } from "@/types/ticket.types";
import { VALID_STATUSES } from "@/types/ticket.types";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import SectionCard from "@/components/app/SectionCard";
import KeyValueList, { KeyValueRow } from "@/components/app/KeyValueList";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import UserAvatar from "@/components/app/UserAvatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayStatus, type TicketPermissions } from "./ticketDetail";

interface TicketPropertiesPanelProps {
  ticket: Ticket;
  permissions: TicketPermissions;
  /** Agents the lead may reassign to */
  agents: AgentUser[];
  busy: boolean;
  onStatusChange: (status: string) => void;
  onReassign: (agentId: string) => void;
}

// A select that reads like the value it holds, until hovered (briefing p.48 properties panel).
// -mr-2 lines the value up with the column edge, so the max width adds those 0.5rem back;
// the negative block margin keeps select rows as tall as the plain text rows.
const INLINE_TRIGGER =
  "-mr-2 -my-2.5 h-10 max-w-[calc(100%+0.5rem)] min-w-0 gap-1 border-transparent bg-transparent px-2 shadow-none hover:bg-muted data-[state=open]:bg-muted sm:-my-1 sm:h-7 dark:bg-transparent *:data-[slot=select-value]:line-clamp-none";

const fullAgentName = (a: AgentUser) => `${a.name} ${a.surname ?? ""}`.trim();

/** Status, priority, assignee, department, category, requester, created (briefing p.41, p.48) */
export default function TicketPropertiesPanel({
  ticket,
  permissions,
  agents,
  busy,
  onStatusChange,
  onReassign,
}: TicketPropertiesPanelProps) {
  const status = displayStatus(ticket);
  const isPending = status === "pending";
  const staff = permissions.isStaff;

  // The lead may pick any agent of the department; keep the current assignee listed even if
  // they aren't an agent (e.g. the lead took it), so the select can show them
  const agentOptions = agents.filter((a) => a.role === "Agent");
  const assigneeListed = !ticket.assignee_id || agentOptions.some((a) => String(a.user_id) === String(ticket.assignee_id));

  return (
    <SectionCard title={staff ? "Properties" : "Details"}>
      <KeyValueList>
        {staff && (
          <KeyValueRow label="Status">
            {isPending ? (
              <StatusBadge status={ticket.ticket_status} />
            ) : (
              <Select value={ticket.ticket_status} onValueChange={onStatusChange} disabled={busy}>
                <SelectTrigger aria-label="Change status" className={INLINE_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper" className="min-w-44 [&_[data-slot=select-item]]:py-1.5">
                  {/* Pending approval is entered only when a request is raised and left only through
                      the lead's Approve / Reject, so the server refuses it here */}
                  {VALID_STATUSES.filter((s) => s !== "Pending approval").map((s) => (
                    <SelectItem key={s} value={s}>
                      <StatusBadge status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </KeyValueRow>
        )}

        <KeyValueRow label="Priority">
          <PriorityBadge priority={ticket.ticket_priority} />
        </KeyValueRow>

        <KeyValueRow label="Assignee">
          {permissions.canReassign && status !== "closed" && status !== "cancelled" && status !== "resolved" ? (
            <Select value={ticket.assignee_id ? String(ticket.assignee_id) : ""} onValueChange={onReassign} disabled={busy}>
              <SelectTrigger aria-label="Reassign to an agent" className={cn(INLINE_TRIGGER, "font-normal")}>
                <SelectValue placeholder={<Unassigned />} />
              </SelectTrigger>
              <SelectContent align="end" position="popper" className="min-w-56">
                {!assigneeListed && ticket.assignee_id && (
                  <SelectItem value={String(ticket.assignee_id)} disabled>
                    <AssigneeLabel name={ticket.assignee_name} me={String(ticket.assignee_id) === permissions.userId} />
                  </SelectItem>
                )}
                {agentOptions.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No agents in this department</p>
                )}
                {agentOptions.map((a) => (
                  <SelectItem key={a.user_id} value={String(a.user_id)}>
                    <AssigneeLabel name={fullAgentName(a)} me={String(a.user_id) === permissions.userId} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : ticket.assignee_name ? (
            <AssigneeLabel
              name={ticket.assignee_name}
              me={!!ticket.assignee_id && String(ticket.assignee_id) === permissions.userId}
            />
          ) : (
            <Unassigned />
          )}
        </KeyValueRow>

        <KeyValueRow label={staff ? "Department" : "Team"}>
          <span className="truncate">{ticket.department_name || "—"}</span>
        </KeyValueRow>
        <KeyValueRow label="Category">
          <span className="truncate">{ticket.category_name || "—"}</span>
        </KeyValueRow>
        {ticket.request_type_name && (
          <KeyValueRow label="Type">
            <span className="truncate">{ticket.request_type_name}</span>
          </KeyValueRow>
        )}
        <KeyValueRow label="Submitted">
          <time dateTime={ticket.created_at} title={formatSast(ticket.created_at, "full")}>
            {formatSast(ticket.created_at, "dateTime")}
          </time>
        </KeyValueRow>
        {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
          <KeyValueRow label="Last update">
            <time dateTime={ticket.updated_at} title={formatSast(ticket.updated_at, "full")}>
              {formatSast(ticket.updated_at, "smart")}
            </time>
          </KeyValueRow>
        )}
      </KeyValueList>
      {staff && isPending && (
        <p className="mt-4 text-xs text-muted-foreground">
          {permissions.canApproveReject
            ? "Status changes once you approve or reject this request."
            : "Status changes once the department lead approves or rejects this request."}
        </p>
      )}
    </SectionCard>
  );
}

function AssigneeLabel({ name, me }: { name: string | null | undefined; me?: boolean }) {
  return (
    // Margins, not gap: SelectValue line-clamps its content, which drops flex gaps from the width
    <span className="flex min-w-0 items-center">
      <UserAvatar name={name} size="sm" />
      <span className="ml-2 truncate font-medium">
        {name || "Unknown"}
        {me && <span className="font-normal text-muted-foreground"> (you)</span>}
      </span>
    </span>
  );
}

function Unassigned() {
  return (
    <span className="flex items-center font-normal text-muted-foreground">
      <span className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      Unassigned
    </span>
  );
}

/** Requester card for staff (briefing p.48 "Requester") */
export function RequesterCard({ ticket }: { ticket: Ticket }) {
  return (
    <SectionCard title="Requester">
      <UserAvatar
        name={ticket.requester_name}
        size="lg"
        description={ticket.requester_email ?? undefined}
        className="[&>span>span:first-child]:font-medium"
      />
    </SectionCard>
  );
}
