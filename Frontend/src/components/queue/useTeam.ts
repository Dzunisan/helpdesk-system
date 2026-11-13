import { useCallback, useEffect, useState } from "react";
import { fetchAgents } from "@/services/ticketService";
import { listTickets } from "@/services/tickets";
import type { AgentUser } from "@/types/ticket.types";

export interface TeamMember {
  user_id: string;
  name: string;
  role: string;
  /** Open + Waiting on employee tickets this person owns right now */
  open: number;
}

/**
 * The people a lead may assign to (agents and leads of the department, GET /tickets/agents) with
 * each person's current load (briefing p.55 "Assign dropdown showing each agent's open load").
 * Load comes from GET /api/tickets?status=Open,Waiting on employee, scoped by the server.
 */
export function useTeam(enabled = true) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([fetchAgents(), listTickets({ status: ["Open", "Waiting on employee"], limit: 100 })])
      .then(([agents, work]) => {
        if (cancelled) return;
        const load: Record<string, number> = {};
        for (const t of work.tickets) if (t.assignee_id) load[t.assignee_id] = (load[t.assignee_id] ?? 0) + 1;
        setMembers(
          agents
            .map((a: AgentUser) => ({
              user_id: String(a.user_id),
              name: `${a.name} ${a.surname ?? ""}`.trim(),
              role: a.role,
              open: load[String(a.user_id)] ?? 0,
            }))
            .sort((a, b) => a.open - b.open || a.name.localeCompare(b.name)),
        );
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  return { members, loading, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}
