import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  /** What it filters: "Role", "Department", "Status". Shown on the trigger while nothing is picked. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: FilterOption[];
  /** Text of the "everything" item (value "all"): "All roles" */
  allLabel: string;
  className?: string;
}

/**
 * Compact filter dropdown for a toolbar (briefing p.61 "Role: All ⌄").
 * Reads "Role" until something is picked, then shows the choice with an indigo tint
 * so an active filter is easy to spot.
 */
export default function FilterSelect({ label, value, onValueChange, options, allLabel, className }: FilterSelectProps) {
  const active = value !== "all";
  const current = options.find((o) => o.value === value)?.label;
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={cn(
          "h-10 w-full min-w-0 text-[13px] sm:h-9 sm:w-auto sm:text-sm",
          active && "border-primary/30 bg-secondary text-secondary-foreground [&_svg]:text-secondary-foreground",
          className,
        )}
      >
        <SelectValue>{active ? current : label}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="min-w-44">
        <SelectItem value="all">{allLabel}</SelectItem>
        <SelectSeparator />
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
