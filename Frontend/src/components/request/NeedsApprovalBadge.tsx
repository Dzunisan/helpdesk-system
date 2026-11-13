import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The violet "Needs approval" tag on approval categories (briefing p.38). Same violet as the
 * Pending approval status, so the two read as one idea.
 */
export default function NeedsApprovalBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-pending-border bg-pending-muted text-pending", className)}>
      Needs approval
    </Badge>
  );
}
