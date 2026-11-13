import { Link } from "react-router-dom";
import type { Category } from "@/types/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CategoryIcon from "./CategoryIcon";
import NeedsApprovalBadge from "./NeedsApprovalBadge";

/**
 * The chosen category at the top of step 2 (briefing p.39): icon, name, where it goes,
 * and a "Change" link back to step 1 with the tile still selected.
 */
export default function CategorySummary({ category, className }: { category: Category; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CategoryIcon name={category.icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
          {category.category_name}
          {category.needs_approval && <NeedsApprovalBadge />}
        </p>
        <p className="text-xs text-muted-foreground">
          Goes to {category.department_name}
          {category.needs_approval && ` · approved by the ${category.department_name} lead first`}
        </p>
      </div>
      <Button asChild variant="ghost" size="sm" className="shrink-0 text-primary hover:text-primary">
        <Link to={`/employee/submit-request?selected=${category.category_id}`}>Change</Link>
      </Button>
    </div>
  );
}
