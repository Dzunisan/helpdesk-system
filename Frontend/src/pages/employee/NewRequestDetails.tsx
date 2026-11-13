import { ClipboardPen } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * New request, step 2: details (briefing p.39, S5): /employee/submit-request/:categoryId.
 * Data: services/categories.ts listCategories (the chosen category's extra fields),
 * services/tickets.ts createTicket({ category_id, title, description, impact, extra_fields }).
 */
export default function NewRequestDetails() {
  return (
    <BeingBuilt
      back={{ to: "/employee/submit-request", label: "What do you need?" }}
      title="New request: details"
      description="Tell us what's going on"
      plan="A short summary, a description, how it affects you and the category's own questions."
      feature="S5"
      icon={ClipboardPen}
    />
  );
}
