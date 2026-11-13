import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { ChevronRight, CircleCheck } from "lucide-react";
import type { Category, CategoryKind } from "@/types/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import CategoryIcon from "./CategoryIcon";
import NeedsApprovalBadge from "./NeedsApprovalBadge";

const KIND_HEADING: Record<CategoryKind, string> = {
  fix: "Something is broken",
  request: "I need something",
};

const KINDS: CategoryKind[] = ["fix", "request"];

interface CategoryTilesProps {
  categories: Category[];
  value: string;
  onValueChange: (value: string) => void;
  /** Double-click or Enter on a tile: go straight to the details step */
  onPick?: (value: string) => void;
}

/**
 * Category tiles grouped "Something is broken" / "I need something" (briefing p.38, p.45):
 * a RadioGroup of card tiles, one per row with a chevron on phones (44px+ tap targets).
 * The department is only a hint under the name: the category decides where it goes.
 */
export default function CategoryTiles({ categories, value, onValueChange, onPick }: CategoryTilesProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      aria-label="What do you need help with?"
      className="flex flex-col gap-8"
    >
      {KINDS.map((kind) => {
        const items = categories.filter((c) => c.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`kind-${kind}`} className="flex flex-col gap-3">
            <h2 id={`kind-${kind}`} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {KIND_HEADING[kind]}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((category) => (
                <CategoryTile key={category.category_id} category={category} onPick={onPick} />
              ))}
            </div>
          </section>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

function CategoryTile({ category, onPick }: { category: Category; onPick?: (value: string) => void }) {
  const value = String(category.category_id);
  return (
    <RadioGroupPrimitive.Item
      value={value}
      onDoubleClick={() => onPick?.(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onPick?.(value);
      }}
      className={cn(
        "group/tile relative flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors outline-none md:min-h-28 md:items-start md:p-5",
        "hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-1 data-[state=checked]:ring-primary data-[state=checked]:hover:bg-primary/5",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors",
          "group-data-[state=checked]/tile:bg-primary group-data-[state=checked]/tile:text-primary-foreground",
        )}
      >
        <CategoryIcon name={category.icon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 md:pr-6">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{category.category_name}</span>
          {category.needs_approval && <NeedsApprovalBadge />}
        </span>
        {category.description && (
          <span className="hidden text-xs leading-relaxed text-muted-foreground md:line-clamp-2">{category.description}</span>
        )}
        <span className="text-xs text-muted-foreground md:mt-auto md:pt-1">{category.department_name}</span>
      </span>
      <RadioGroupPrimitive.Indicator className="absolute top-3 right-3 hidden text-primary md:block">
        <CircleCheck className="size-5 fill-primary text-primary-foreground" aria-hidden />
      </RadioGroupPrimitive.Indicator>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground/60 group-data-[state=checked]/tile:text-primary md:hidden"
      />
    </RadioGroupPrimitive.Item>
  );
}

/** Loading tiles shaped like the real ones */
export function CategoryTilesSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading categories">
      {[6, 3].map((count, group) => (
        <div key={group} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-36" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 md:min-h-28 md:items-start md:p-5">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2 py-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
