import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/**
 * The row between the PageHeader and a list: tabs/filters on the left, search on the right.
 * Stacks on phones. (briefing p.37, p.47)
 * @example <Toolbar><FilterTabs …/><SearchInput …/></Toolbar>
 */
export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>{children}</div>
  );
}

export interface FilterTab<T extends string = string> {
  value: T;
  label: string;
  /** Shown muted after the label, tabular */
  count?: number;
}

interface FilterTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: FilterTab<T>[];
  /** Accessible name for the tab list, e.g. "Filter requests by status" */
  "aria-label"?: string;
  className?: string;
}

/**
 * Segmented tabs with counts ("Active 5 · Resolved 1 …"). Fills the width on phones (40px tall)
 * and scrolls sideways instead of overflowing if the labels still don't fit; 36px tall from sm.
 * @example <FilterTabs value={tab} onValueChange={setTab} items={[{ value: "active", label: "Active", count: 5 }]} />
 */
export function FilterTabs<T extends string>({ value, onValueChange, items, className, ...aria }: FilterTabsProps<T>) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as T)} className={cn("min-w-0", className)}>
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList
          aria-label={aria["aria-label"]}
          className="w-max min-w-full group-data-horizontal/tabs:h-10 sm:min-w-0 sm:group-data-horizontal/tabs:h-9"
        >
          {items.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-1 px-2 text-[13px] sm:flex-none sm:px-3 sm:text-sm">
              {item.label}
              {item.count !== undefined && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{item.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name; defaults to the placeholder */
  "aria-label"?: string;
  id?: string;
  className?: string;
}

/**
 * Search box with a search icon and a clear button. Full width on phones, 18rem from sm.
 * @example <SearchInput value={search} onValueChange={setSearch} placeholder="Search by title or HD number" />
 */
export function SearchInput({ value, onValueChange, placeholder = "Search", id, className, ...aria }: SearchInputProps) {
  return (
    <InputGroup className={cn("h-10 w-full sm:h-9 sm:w-72", className)}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="search"
        aria-label={aria["aria-label"] ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onValueChange("")}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
