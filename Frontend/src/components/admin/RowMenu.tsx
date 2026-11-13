import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The "⋯" menu at the end of an admin list row (briefing p.62 "DropdownMenu (row menu)").
 * 40px tap target on phones, 32px from sm. Children are DropdownMenuItems.
 */
export default function RowMenu({
  label,
  disabled,
  className,
  children,
}: {
  /** Accessible name: "Actions for Thabo Nkosi" */
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={cn("relative z-10 size-10 text-muted-foreground hover:text-foreground sm:size-8", className)}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
