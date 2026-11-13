import StaffTicketView from "@/components/tickets/StaffTicketView";

/**
 * Ticket detail for staff (/agent/tickets/:id, /department-lead/tickets/:id): the three-pane
 * inbox (briefing p.48-49, S2-S4). Employees have their own page, pages/employee/RequestDetail.tsx
 * (p.41), at /employee/tickets/:id.
 */
export default function TicketDetails() {
  return <StaffTicketView />;
}
