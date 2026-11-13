/**
 * The agent's queue views (briefing p.46-47): one route, /agent/queue/:view, rendered by
 * pages/agent/TicketQueue.tsx. Link with agentQueuePath("unassigned").
 */
export type AgentQueueView = "my-open" | "unassigned" | "waiting" | "breached" | "resolved";

export const AGENT_QUEUE_VIEWS: AgentQueueView[] = ["my-open", "unassigned", "waiting", "breached", "resolved"];

export const AGENT_QUEUE_LABEL: Record<AgentQueueView, string> = {
  "my-open": "My open",
  unassigned: "Unassigned",
  waiting: "Waiting on employee",
  breached: "Breached",
  resolved: "Resolved by me",
};

export const agentQueuePath = (view: AgentQueueView) => `/agent/queue/${view}`;

export const isAgentQueueView = (value: string | undefined): value is AgentQueueView =>
  AGENT_QUEUE_VIEWS.includes(value as AgentQueueView);
