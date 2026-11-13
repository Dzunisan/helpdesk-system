import type { ReactNode } from "react";
import { Check, ChevronDown, UserRoundPlus } from "lucide-react";
import { formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { Assignee } from "./useClaim";
import type { TeamMember } from "./useTeam";

interface AssignMenuProps {
  ticket: { ticket_id: number; assignee_id: string | null; assignee_name: string | null };
  /** Agents and leads of the department with their open load (useTeam) */
  members: TeamMember[];
  membersLoading?: boolean;
  membersError?: boolean;
  /** The signed-in lead's id, to label "(you)" */
  currentUserId?: string;
  onAssign: (assignee: Assignee) => void;
  assigning?: boolean;
  disabled?: boolean;
  /** Replace the default trigger (e.g. "Reassign" in the ticket's action bar) */
  trigger?: ReactNode;
  align?: "start" | "end";
  className?: string;
}

/**
 * The lead's assignee picker (briefing p.55): each person with their current load ("5 open"),
 * least busy first. Assigns in place; never navigates. The trigger reads "Unassigned ⌄" or the
 * current owner.
 */
export default function AssignMenu({
  ticket,
  members,
  membersLoading,
  membersError,
  currentUserId,
  onAssign,
  assigning,
  disabled,
  trigger,
  align = "end",
  className,
}: AssignMenuProps) {
  const ref = formatTicketRef(ticket.ticket_id);
  const owner = ticket.assignee_id ? String(ticket.assignee_id) : null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || assigning}
            aria-label={owner ? `Reassign ${ref}` : `Assign ${ref}`}
            className={cn(
              "relative z-10 h-10 w-auto max-w-full justify-between gap-2 bg-transparent font-normal shadow-none sm:h-8 xl:w-full",
              owner ? "text-foreground" : "border-dashed text-muted-foreground hover:border-solid",
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {assigning ? (
                <Spinner className="size-3.5" />
              ) : owner ? (
                <UserAvatar name={ticket.assignee_name} size="sm" className="data-[size=sm]:size-5" />
              ) : (
                <UserRoundPlus className="size-3.5" aria-hidden />
              )}
              <span className="truncate">{assigning ? "Assigning" : owner ? ticket.assignee_name || "Assigned" : "Unassigned"}</span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {owner ? `Reassign ${ref} to` : `Assign ${ref} to`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {membersError ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Couldn't load the team. Try again in a moment.</p>
        ) : membersLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading the team…</p>
        ) : members.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nobody in this department can take tickets yet.</p>
        ) : (
          members.map((member) => {
            const isMe = currentUserId !== undefined && member.user_id === String(currentUserId);
            const current = member.user_id === owner;
            return (
              <DropdownMenuItem
                key={member.user_id}
                disabled={current}
                onSelect={() => onAssign({ id: member.user_id, name: isMe ? "you" : member.name })}
                className="gap-2.5 py-2"
              >
                <UserAvatar name={member.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {member.name}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {current ? (
                  <Check className="size-3.5 text-muted-foreground" aria-label="Current owner" />
                ) : (
                  <span className="text-xs text-muted-foreground tabular-nums">{member.open} open</span>
                )}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
