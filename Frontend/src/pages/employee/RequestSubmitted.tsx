import { CircleCheck } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * New request, step 3: submitted (briefing p.40, S5): /employee/tickets/:id/submitted.
 * Data: services/tickets.ts getTicket(id): ticket_id (HD reference), department_name,
 * first_response_due_at ("IT Support will reply by 18:14 today").
 */
export default function RequestSubmitted() {
  return (
    <BeingBuilt
      back={{ to: "/employee/my-requests", label: "My requests" }}
      title="Request submitted"
      description="Your reference number and when you'll hear back"
      plan="The HD reference, a summary of the request and the time the team promises a first reply."
      feature="S5"
      icon={CircleCheck}
    />
  );
}
