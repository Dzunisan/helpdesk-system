import type { ReactNode } from "react";
import { RotateCcw, Users } from "lucide-react";
import type { Ticket, TicketPriority } from "@/types/api";
import { TICKET_PRIORITIES } from "@/types/api";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import KeyValueList, { KeyValueRow } from "@/components/app/KeyValueList";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import { StatusBadge } from "@/components/app/StatusBadge";
import UserAvatar from "@/components/app/UserAvatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AssignMenu from "@/components/queue/AssignMenu";
import { formatTarget, minutesBetween, ticketClocks } from "@/components/queue/ticketSla";
import type { Assignee } from "@/components/queue/useClaim";
import type { TeamMember } from "@/components/queue/useTeam";
import { useTicketCount } from "@/components/queue/useTicketList";

// A select that reads like the value it holds until hovered (same as TicketPropertiesPanel)
const INLINE_TRIGGER =
  "-mr-2 -my-2.5 h-10 max-w-[calc(100%+0.5rem)] min-w-0 gap-1 border-transparent bg-transparent px-2 shadow-none hover:bg-muted data-[state=open]:bg-muted sm:-my-1 sm:h-7 dark:bg-transparent *:data-[slot=select-value]:line-clamp-none";

interface StaffPropertiesPanelProps {
  ticket: Ticket;
  currentUserId: string;
  /** GET /actions "change_priority" */
  canChangePriority: boolean;
  /** GET /actions "assign" (the lead) */
  canAssign: boolean;
  /** A priority change or assignment is running */
  pending: "change_priority" | "assign" | null;
  disabled: boolean;
  onPriorityChange: (priority: TicketPriority) => void;
  team: { members: TeamMember[]; loading: boolean; error: boolean };
  onAssign: (assignee: Assignee) => void;
}

/**
 * The inbox's right pane (briefing p.48): status, priority Select, assignee, department,
 * category, both SLA clocks, the requester and when it was created.
 */
export default function StaffPropertiesPanel({
  ticket,
  currentUserId,
  canChangePriority,
  canAssign,
  pending,
  disabled,
  onPriorityChange,
  team,
  onAssign,
}: StaffPropertiesPanelProps) {
  const { firstResponse, resolution } = ticketClocks(ticket);
  const isMine = !!ticket.assignee_id && ticket.assignee_id === currentUserId;
  const { count: requesterTickets } = useTicketCount({ creator_id: ticket.requester_id });
  const otherRequests = requesterTickets === null ? null : Math.max(0, requesterTickets - 1);

  return (
    <div className="flex flex-col gap-6">
      <PaneSection title="Properties">
        <KeyValueList>
          <KeyValueRow label="Status">
            <StatusBadge status={ticket.ticket_status} />
          </KeyValueRow>
          <KeyValueRow label="Priority">
            {canChangePriority ? (
              <Select
                value={ticket.ticket_priority}
                onValueChange={(value) => value !== ticket.ticket_priority && onPriorityChange(value as TicketPriority)}
                disabled={disabled}
              >
                <SelectTrigger aria-label="Change priority" className={INLINE_TRIGGER}>
                  {pending === "change_priority" ? <Spinner className="size-3.5" /> : null}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper" className="min-w-36">
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <PriorityBadge priority={p} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <PriorityBadge priority={ticket.ticket_priority} />
            )}
          </KeyValueRow>
          <KeyValueRow label="Assignee">
            {canAssign ? (
              <AssignMenu
                ticket={ticket}
                members={team.members}
                membersLoading={team.loading}
                membersError={team.error}
                currentUserId={currentUserId}
                onAssign={onAssign}
                assigning={pending === "assign"}
                disabled={disabled}
                className="-mr-2 h-10 border-transparent px-2 hover:bg-muted sm:h-7 xl:w-auto"
              />
            ) : ticket.assignee_name ? (
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar name={ticket.assignee_name} size="sm" />
                <span className="truncate">
                  {ticket.assignee_name}
                  {isMine && <span className="font-normal text-muted-foreground"> (you)</span>}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 font-normal text-muted-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
                  <Users className="size-3" aria-hidden />
                </span>
                Unassigned
              </span>
            )}
          </KeyValueRow>
          <KeyValueRow label="Department">
            <span className="truncate">{ticket.department_name || "—"}</span>
          </KeyValueRow>
          <KeyValueRow label="Category">
            <span className="truncate">{ticket.category_name || "—"}</span>
          </KeyValueRow>
        </KeyValueList>
      </PaneSection>

      <Separator />

      <PaneSection title="SLA">
        {firstResponse || resolution ? (
          <KeyValueList>
            {firstResponse && (
              <KeyValueRow label="First response">
                <ClockChip clock={firstResponse} />
              </KeyValueRow>
            )}
            {resolution && (
              <KeyValueRow label="Resolution">
                <ClockChip clock={resolution} />
              </KeyValueRow>
            )}
          </KeyValueList>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ticket.ticket_status === "Pending approval" ? "The clocks start when the lead approves it." : "No targets for this ticket."}
          </p>
        )}
        {ticket.reopen_count > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="size-3.5" aria-hidden />
            Reopened {ticket.reopen_count === 1 ? "once" : `${ticket.reopen_count} times`}
          </p>
        )}
      </PaneSection>

      <Separator />

      <PaneSection title="Requester">
        <div className="flex flex-col gap-2">
          <UserAvatar
            name={ticket.requester_name}
            size="lg"
            description={ticket.requester_email ?? undefined}
            className="[&>span>span:first-child]:font-medium"
          />
          {otherRequests !== null && (
            <p className="pl-13 text-xs text-muted-foreground tabular-nums">
              {otherRequests === 0 ? "No other requests" : `${otherRequests} other ${otherRequests === 1 ? "request" : "requests"}`}
            </p>
          )}
        </div>
      </PaneSection>

      {ticket.resolution_note && (
        <>
          <Separator />
          <PaneSection title="Resolution note">
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">{ticket.resolution_note}</p>
          </PaneSection>
        </>
      )}

      <p className="text-xs text-muted-foreground tabular-nums">
        Created{" "}
        <time dateTime={ticket.created_at} title={formatSast(ticket.created_at, "full")}>
          {formatSast(ticket.created_at, "dateTime")}
        </time>
      </p>
    </div>
  );
}

function PaneSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label={title}>
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** The chip, with the target on hover */
function ClockChip({ clock }: { clock: NonNullable<ReturnType<typeof ticketClocks>["firstResponse"]> }) {
  const chip = <SlaChip due={clock.due} met={clock.met} start={clock.start} />;
  if (!clock.due) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {chip}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Target {formatTarget(minutesBetween(clock.start, clock.due))} · due {formatSast(clock.due, "dateTime")}
      </TooltipContent>
    </Tooltip>
  );
}
