import { useParams } from "react-router-dom";
import { Star } from "lucide-react";
import { formatTicketRef } from "@/lib/format";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * S10 CSAT survey (briefing p.19, p.43): /employee/tickets/:id/feedback, the link in the
 * "How did we do?" notification and email. PLACEHOLDER: the CSAT feature replaces this component
 * (stars, quick tags, comment, services/feedback.ts); keep the route.
 */
export default function CsatSurvey() {
  const { id } = useParams();
  const ticketId = Number(id);
  const back = Number.isInteger(ticketId) && ticketId > 0
    ? { to: `/employee/tickets/${ticketId}`, label: formatTicketRef(ticketId) }
    : { to: "/employee/my-requests", label: "My requests" };
  return (
    <BeingBuilt
      title="How did we do?"
      description="One quick rating helps the team get better"
      plan="Rate the help you got from one to five stars, pick what went well and add a comment if you like."
      feature="S10"
      back={back}
      icon={Star}
    />
  );
}
