import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface FilterChipProps<T extends string> {
  /** "Priority", "Category", "SLA" */
  label: string;
  value: T;
  /** The "Any" value: the chip looks quiet while it is selected */
  anyValue: T;
  options: ChipOption<T>[];
  onValueChange: (value: T) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

/**
 * A filter chip for the queue toolbar (briefing p.47 "Priority: Any ⌄"): an outline button that
 * turns indigo-tinted (secondary) while it filters, with a radio menu of choices.
 */
export default function FilterChip<T extends string>({
  label,
  value,
  anyValue,
  options,
  onValueChange,
  icon: Icon,
  disabled,
}: FilterChipProps<T>) {
  const active = value !== anyValue;
  const current = options.find((o) => o.value === value)?.label ?? "Any";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={active ? "secondary" : "outline"}
          size="sm"
          disabled={disabled}
          aria-label={`${label}: ${current}`}
          className={cn(
            "h-10 max-w-full justify-between gap-1.5 font-normal shadow-none sm:h-8",
            active ? "border-primary/20 text-secondary-foreground" : "text-muted-foreground",
          )}
        >
          {Icon && <Icon data-icon="inline-start" aria-hidden />}
          <span className="truncate">
            {label}: <span className={cn(active ? "font-medium" : "text-foreground")}>{current}</span>
          </span>
          <ChevronDown data-icon="inline-end" aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
