import LeadTicketList from "@/components/queue/LeadTicketList";

/**
 * All tickets, the lead's department list (briefing p.55): /department-lead/all-tickets.
 * Tabs Unassigned / Open / Waiting on employee / Pending approval / Resolved (7 days) with counts
 * (?tab= keeps the tab in the address), the Assign dropdown with each agent's open load, and the
 * bulk bar (disabled until N4).
 */
export default function AllTickets() {
  return <LeadTicketList />;
}
