import LeadTicketList from "@/components/queue/LeadTicketList";

/**
 * All tickets, the lead's home list (briefing p.55): /department-lead/all-tickets.
 * Builds on the existing LeadTicketList (tabs, Assign dropdown). Sprint 1 adds the Breached tab
 * sorted by due (S3: listTickets({ sort: "due", sla: "breached" })) and the last activity column (S4).
 */
export default function AllTickets() {
  return <LeadTicketList />;
}
