import { Shapes, SignalHigh, Timer } from "lucide-react";
import type { Category } from "@/types/api";
import { SearchInput } from "@/components/app/Toolbar";
import { Button } from "@/components/ui/button";
import FilterChip from "./FilterChip";
import { ANY, PRIORITY_OPTIONS, SLA_OPTIONS, type QueueFilterState } from "./useQueueFilters";


interface QueueFiltersProps {
  filters: QueueFilterState;
  categories: Category[];
  /** Hide the SLA chip (the Breached view already filters by it; finished work has no running clock) */
  hideSla?: boolean;
  searchId: string;
}

/** Filter chips on the left, search on the right; stacks on phones */
export default function QueueFilters({ filters, categories, hideSla, searchId }: QueueFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <FilterChip
          label="Priority"
          icon={SignalHigh}
          value={filters.priority}
          anyValue={ANY}
          options={PRIORITY_OPTIONS}
          onValueChange={filters.setPriority}
        />
        <FilterChip
          label="Category"
          icon={Shapes}
          value={filters.category}
          anyValue={ANY}
          options={[{ value: ANY, label: "Any" }, ...categories.map((c) => ({ value: String(c.category_id), label: c.category_name }))]}
          onValueChange={filters.setCategory}
        />
        {!hideSla && (
          <FilterChip label="SLA" icon={Timer} value={filters.sla} anyValue={ANY} options={SLA_OPTIONS} onValueChange={filters.setSla} />
        )}
        {filters.active && (
          <Button variant="ghost" size="sm" onClick={filters.clear} className="h-10 text-muted-foreground sm:h-8">
            Clear
          </Button>
        )}
      </div>
      <SearchInput id={searchId} value={filters.search} onValueChange={filters.setSearch} placeholder="Search subject, name or HD number" />
    </div>
  );
}
