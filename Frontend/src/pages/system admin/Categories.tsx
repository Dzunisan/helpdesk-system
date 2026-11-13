import { Shapes } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * Categories & routing (briefing p.63, S5): /system-admin/categories.
 * Data: services/categories.ts (listCategories({ includeInactive: true }), createCategory, updateCategory).
 */
export default function Categories() {
  return (
    <BeingBuilt
      title="Categories & routing"
      description="What employees choose on the New request form, and where each choice goes"
      plan="A table of categories grouped by department, with a side panel to set the department, default priority, approval and extra fields."
      feature="S5"
      icon={Shapes}
    />
  );
}
