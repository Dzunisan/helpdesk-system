import { CircleCheck, CircleX } from "lucide-react";
import type { ApprovalDecision } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** "Approved" (emerald) or "Rejected" (rose) on the Decided by me tab and in the drawer (p.56) */
export default function DecisionBadge({ decision, className }: { decision: ApprovalDecision; className?: string }) {
  const approved = decision === "approved";
  const Icon = approved ? CircleCheck : CircleX;
  return (
    <Badge
      variant="outline"
      className={cn(
        approved ? "border-success-border bg-success-muted text-success" : "border-destructive/25 bg-destructive/5 text-destructive",
        className,
      )}
    >
      <Icon aria-hidden />
      {approved ? "Approved" : "Rejected"}
    </Badge>
  );
}
