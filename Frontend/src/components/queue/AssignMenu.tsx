import { ChevronDown, UserRoundPlus } from "lucide-react";
import type { AgentUser, Ticket } from "@/types/ticket.types";
import { formatTicketRef } from "@/lib/format";
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

interface AssignMenuProps {
  ticket: Ticket;
  /** Agents and leads of the department (GET /tickets/agents) */
  agents: AgentUser[];
  /** Open tickets each person owns right now, by user id (from the loaded list) */
  load: Record<string, number>;
  /** The signed-in lead's id, to label "(you)" */
  currentUserId?: string;
  onAssign: (agent: { id: string; name: string }) => void;
  assigning?: boolean;
  disabled?: boolean;
  agentsError?: boolean;
}

const nameOf = (agent: AgentUser) => `${agent.name} ${agent.surname ?? ""}`.trim();

/**
 * "Unassigned ⌄" in the lead's Assignee column (briefing p.55): pick an agent, see each
 * person's current load. Assigns in place; never navigates.
 */
export default function AssignMenu({
  ticket,
  agents,
  load,
  currentUserId,
  onAssign,
  assigning,
  disabled,
  agentsError,
}: AssignMenuProps) {
  const ref = formatTicketRef(ticket.ticket_id);
  const sorted = [...agents].sort((a, b) => (load[a.user_id] ?? 0) - (load[b.user_id] ?? 0) || nameOf(a).localeCompare(nameOf(b)));

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || assigning}
          aria-label={`Assign ${ref}`}
          className="relative z-10 h-10 w-auto justify-between gap-2 border-dashed bg-transparent font-normal text-muted-foreground shadow-none hover:border-solid sm:h-8 xl:w-full"
        >
          <span className="inline-flex items-center gap-2">
            {assigning ? <Spinner className="size-3.5" /> : <UserRoundPlus className="size-3.5" aria-hidden />}
            {assigning ? "Assigning" : "Unassigned"}
          </span>
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Assign {ref} to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agentsError ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Couldn't load the team. Open the ticket to assign it.</p>
        ) : sorted.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading the team…</p>
        ) : (
          sorted.map((agent) => {
            const name = nameOf(agent);
            const open = load[agent.user_id] ?? 0;
            const isMe = currentUserId !== undefined && String(agent.user_id) === String(currentUserId);
            return (
              <DropdownMenuItem
                key={agent.user_id}
                onSelect={() => onAssign({ id: String(agent.user_id), name: isMe ? "you" : name })}
                className="gap-2.5 py-2"
              >
                <UserAvatar name={name} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{open} open</span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
