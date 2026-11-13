import { Timer } from "lucide-react";
import BeingBuilt from "@/components/app/BeingBuilt";

/**
 * SLA policies (briefing p.64, S3): /system-admin/sla.
 * Data: services/slaPolicies.ts (listSlaPolicies, updateSlaPolicy).
 */
export default function SlaPolicies() {
  return (
    <BeingBuilt
      title="SLA policies"
      description="How quickly IT, HR, Facilities and Finance promise to respond and resolve"
      plan="One row per priority with first response and resolution targets, and a worked example of what a change means."
      feature="S3"
      icon={Timer}
    />
  );
}
