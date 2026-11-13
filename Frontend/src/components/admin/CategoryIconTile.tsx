import { createElement } from "react";
import { cn } from "@/lib/utils";
import { categoryIcon } from "@/lib/categoryIcons";

/** The lucide icon for a stored category icon name, e.g. "key-round" */
export function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return createElement(categoryIcon(name), { "aria-hidden": true, className: cn("size-4", className) });
}

/** A category's icon on a soft square, as on the request tiles (briefing p.38, p.63) */
export default function CategoryIconTile({
  name,
  muted,
  className,
}: {
  name: string | null | undefined;
  /** Inactive categories: grey instead of the indigo tint */
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        muted ? "bg-muted text-muted-foreground" : "bg-secondary text-primary",
        className,
      )}
    >
      <CategoryIcon name={name} />
    </span>
  );
}
