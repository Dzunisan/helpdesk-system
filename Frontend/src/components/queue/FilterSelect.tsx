import type { LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterSelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: FilterOption<T>[];
  /** Accessible name, e.g. "Filter by category" */
  label: string;
  icon?: LucideIcon;
  id?: string;
  className?: string;
}

/**
 * A compact toolbar Select (category, priority, sort). Full width and 40px tall on phones,
 * 36px from sm, so it lines up with SearchInput.
 */
export default function FilterSelect<T extends string>({
  value,
  onValueChange,
  options,
  label,
  icon: Icon,
  id,
  className,
}: FilterSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className={cn(
          "w-full shadow-none data-[size=default]:h-10 sm:w-auto sm:min-w-40 sm:data-[size=default]:h-9 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:text-left",
          className,
        )}
      >
        {Icon && <Icon className="text-muted-foreground" aria-hidden />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
