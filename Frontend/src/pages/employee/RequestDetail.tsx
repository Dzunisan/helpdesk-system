import TicketDetails from "@/pages/tickets/TicketDetails";

/**
 * Request detail, the employee view (briefing p.41): /employee/tickets/:id.
 * Staff keep pages/tickets/TicketDetails.tsx. Until the employee view is rebuilt here
 * (header with who is working on it, progress bar, public timeline from GET /timeline,
 * Cancel / Yes, it's fixed / Still broken from GET /actions), it shows the shared ticket page
 * so employees never lose the screen.
 */
export default function RequestDetail() {
  return <TicketDetails />;
}
