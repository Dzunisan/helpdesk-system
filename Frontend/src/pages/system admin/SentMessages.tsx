import { Send } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * S9 Sent messages (briefing p.18, p.30 step 1): /system-admin/outbox. PLACEHOLDER: the
 * notifications feature replaces this component (outbox table with status, Run jobs now button,
 * services/admin.ts); keep the route.
 */
export default function SentMessages() {
  return (
    <BeingBuilt
      title="Sent messages"
      description="Every email the helpdesk sent or simulated, with its delivery status"
      plan="See each email with its status (sent, failed or simulated) and run the breach alerts and auto-close jobs on demand."
      feature="S9"
      icon={Send}
    />
  );
}
