import type { Ticket, TicketListParams } from "@/types/api";

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

/**
 * The lead's tabs on All tickets (briefing p.55). In Sprint 1 All tickets is the lead's home
 * (the Lead index redirects here), so Breached comes first and is the default tab.
 */
export type LeadTab = "breached" | "unassigned" | "open" | "waiting" | "pending" | "resolved";

export const LEAD_TABS: LeadTab[] = ["breached", "unassigned", "open", "waiting", "pending", "resolved"];

/** The tab All tickets opens on when the address has no ?tab= */
export const DEFAULT_LEAD_TAB: LeadTab = "breached";

export const isLeadTab = (value: string | null | undefined): value is LeadTab => LEAD_TABS.includes(value as LeadTab);

/** Resolved (7 days): how far back the lead's Resolved tab looks */
export const RESOLVED_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * One list of tickets: what to ask GET /api/tickets for (docs/api-sprint-1.md "Queue views")
 * and the words around it. Shared by the queue pages and the left pane of the ticket inbox.
 */
export interface TicketView {
  /** "agent:my-open", "lead:pending": what the inbox's left pane remembers */
  id: string;
  label: string;
  /** Sentence under the title; `{team}` is replaced with the department name */
  description: string;
  params: TicketListParams;
  /** Extra browser-side narrowing the API has no parameter for (Resolved in the last 7 days) */
  filter?: (ticket: Ticket, now: number) => boolean;
  /** Finished work: show "Updated" instead of "Age", no Claim button */
  finished?: boolean;
  /** Rows get a Claim button (unassigned tickets) */
  claimable?: boolean;
  /** Where the list lives, for "Back" links and the sidebar highlight */
  path: string;
  empty: { title: string; description: string };
}

const ACTIVE: TicketListParams["status"] = ["New", "Open", "Waiting on employee"];

export const AGENT_VIEWS: Record<AgentQueueView, TicketView> = {
  "my-open": {
    id: "agent:my-open",
    label: AGENT_QUEUE_LABEL["my-open"],
    description: "Tickets you own · most at risk first",
    params: { assignee_id: "me", status: ["Open", "Waiting on employee"], sort: "due" },
    path: agentQueuePath("my-open"),
    empty: { title: "Nothing on your plate", description: "Claim the next ticket in the queue to get started." },
  },
  unassigned: {
    id: "agent:unassigned",
    label: AGENT_QUEUE_LABEL.unassigned,
    description: "Waiting for an owner in {team} · sorted by SLA due, most at risk first",
    params: { status: "New", sort: "due" },
    claimable: true,
    path: agentQueuePath("unassigned"),
    empty: { title: "Queue clear", description: "Nothing unassigned in {team}. New requests land here first." },
  },
  waiting: {
    id: "agent:waiting",
    label: AGENT_QUEUE_LABEL.waiting,
    description: "Your tickets where the ball is with the employee · their reply moves them back to My open",
    params: { assignee_id: "me", status: "Waiting on employee", sort: "due" },
    path: agentQueuePath("waiting"),
    empty: { title: "Nobody owes you a reply", description: "Tickets you set to Waiting on employee show up here." },
  },
  breached: {
    id: "agent:breached",
    label: AGENT_QUEUE_LABEL.breached,
    description: "Every overdue ticket in {team} · most overdue first",
    params: { sla: "breached", status: ACTIVE, sort: "due" },
    claimable: true,
    path: agentQueuePath("breached"),
    empty: { title: "No breaches", description: "Every open ticket in {team} is inside its targets." },
  },
  resolved: {
    id: "agent:resolved",
    label: AGENT_QUEUE_LABEL.resolved,
    description: "Tickets you resolved · most recent first",
    params: { assignee_id: "me", status: ["Resolved", "Closed"], sort: "updated" },
    finished: true,
    path: agentQueuePath("resolved"),
    empty: { title: "Nothing resolved yet", description: "Tickets you resolve show up here until they close and after." },
  },
};

export const LEAD_TAB_LABEL: Record<LeadTab, string> = {
  breached: "Breached",
  unassigned: "Unassigned",
  open: "Open",
  waiting: "Waiting on employee",
  pending: "Pending approval",
  resolved: "Resolved (7 days)",
};

export const leadTabPath = (tab: LeadTab) =>
  tab === DEFAULT_LEAD_TAB ? "/department-lead/all-tickets" : `/department-lead/all-tickets?tab=${tab}`;

export const LEAD_VIEWS: Record<LeadTab, TicketView> = {
  breached: {
    id: "lead:breached",
    label: LEAD_TAB_LABEL.breached,
    description: "Every overdue ticket in {team} · most overdue first",
    params: { sla: "breached", status: ACTIVE, sort: "due" },
    claimable: true,
    path: leadTabPath("breached"),
    empty: { title: "No breaches", description: "Every open ticket in {team} is inside its targets." },
  },
  unassigned: {
    id: "lead:unassigned",
    label: LEAD_TAB_LABEL.unassigned,
    description: "Nobody owns these yet · most at risk first",
    params: { status: "New", sort: "due" },
    claimable: true,
    path: leadTabPath("unassigned"),
    empty: { title: "Every ticket has an owner", description: "New requests in {team} land here first." },
  },
  open: {
    id: "lead:open",
    label: LEAD_TAB_LABEL.open,
    description: "Being worked on · most at risk first",
    params: { status: "Open", sort: "due" },
    path: leadTabPath("open"),
    empty: { title: "No open tickets", description: "Nobody on the team is working a ticket right now." },
  },
  waiting: {
    id: "lead:waiting",
    label: LEAD_TAB_LABEL.waiting,
    description: "The ball is with the employee",
    params: { status: "Waiting on employee", sort: "due" },
    path: leadTabPath("waiting"),
    empty: { title: "Nobody is waiting", description: "Tickets the team set to Waiting on employee show up here." },
  },
  pending: {
    id: "lead:pending",
    label: LEAD_TAB_LABEL.pending,
    description: "Requests that need your yes before an agent picks them up",
    params: { status: "Pending approval", sort: "created" },
    path: leadTabPath("pending"),
    empty: { title: "No requests to approve", description: "Requests that need approval wait here for you." },
  },
  resolved: {
    id: "lead:resolved",
    label: LEAD_TAB_LABEL.resolved,
    description: "Resolved in the last 7 days · most recent first",
    params: { status: ["Resolved", "Closed"], sort: "updated", limit: 100 },
    filter: (t, now) => !!t.resolved_at && now - new Date(t.resolved_at).getTime() <= RESOLVED_WINDOW_DAYS * DAY_MS,
    finished: true,
    path: leadTabPath("resolved"),
    empty: { title: "Nothing resolved this week", description: "Tickets the team resolves show up here for 7 days." },
  },
};

/** Look a view up by its id ("agent:my-open"); undefined for anything else */
export function viewById(id: string | null | undefined): TicketView | undefined {
  if (!id) return undefined;
  const [scope, key] = id.split(":");
  if (scope === "agent" && isAgentQueueView(key)) return AGENT_VIEWS[key];
  if (scope === "lead" && isLeadTab(key)) return LEAD_VIEWS[key];
  return undefined;
}

/** "{team}" -> the department name */
export const withTeam = (text: string, team: string) => text.replaceAll("{team}", team);

/** Router state a list row passes to the ticket page, so the inbox shows the same list on the left */
export interface TicketLinkState {
  view?: string;
}
