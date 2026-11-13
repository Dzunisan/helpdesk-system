import { Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * S7 Macros manager (briefing p.16, p.58): /department-lead/macros. PLACEHOLDER: the macros feature
 * replaces this component (two-pane list + editor, services/macros.ts); keep the route.
 */
export default function MacrosManager() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  return (
    <BeingBuilt
      title="Macros"
      description={departmentName ? `Saved replies for ${departmentName} agents` : "Saved replies for your agents"}
      plan="Write saved replies with placeholders like the requester's first name, set the status they apply, and see how often each one is used."
      feature="S7"
      icon={Zap}
    />
  );
}
