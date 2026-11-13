import { createElement } from "react";
import { categoryIcon } from "@/lib/categoryIcons";

/**
 * The lucide icon for a stored category icon name, e.g. <CategoryIcon name="wifi" className="size-4" />.
 * Same map as the System Admin's icon picker (lib/categoryIcons.ts).
 */
export default function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return createElement(categoryIcon(name), { className, "aria-hidden": true });
}
