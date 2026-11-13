import { forwardRef } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import {
  Building2,
  CircleCheck,
  FolderOpen,
  Laptop,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Department } from "@/hooks/useDepartments";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A friendly icon per team, picked from the department name; unknown teams get a folder */
function departmentIcon(name: string | null | undefined): LucideIcon {
  const n = (name ?? "").toLowerCase();
  if (/\bit\b|tech|support|ict/.test(n)) return Laptop;
  if (/human|\bhr\b|people|payroll/.test(n)) return Users;
  if (/facilit|building|office|maintenance/.test(n)) return Building2;
  if (/financ|account|budget/.test(n)) return Wallet;
  return FolderOpen;
}

interface DepartmentPickerProps {
  departments: Department[];
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * The teams as selectable card tiles (briefing p.38 "RadioGroup as Card tiles").
 * The ref lands on the first tile so the form can focus it on a validation error.
 */
const DepartmentPicker = forwardRef<HTMLButtonElement, DepartmentPickerProps>(function DepartmentPicker(
  { departments, value, onValueChange, invalid, id, ...aria },
  firstTileRef,
) {
  return (
    <RadioGroupPrimitive.Root
      id={id}
      value={value}
      onValueChange={onValueChange}
      aria-invalid={invalid || undefined}
      aria-required
      className="grid gap-3 sm:grid-cols-2"
      {...aria}
    >
      {departments.map((d, index) => {
        const Icon = departmentIcon(d.department_name);
        const itemValue = String(d.department_id);
        return (
          <RadioGroupPrimitive.Item
            key={itemValue}
            ref={index === 0 ? firstTileRef : undefined}
            value={itemValue}
            className={cn(
              "group/tile relative flex min-h-16 w-full scroll-mt-28 items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors outline-none",
              "hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-1 data-[state=checked]:ring-primary data-[state=checked]:hover:bg-primary/5",
              invalid ? "border-destructive/50" : "border-border",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors",
                "group-data-[state=checked]/tile:bg-primary group-data-[state=checked]/tile:text-primary-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
              <span className="text-sm font-medium text-foreground">{d.department_name}</span>
              {d.description && (
                <span className="text-xs leading-relaxed text-muted-foreground">{d.description}</span>
              )}
            </span>
            <RadioGroupPrimitive.Indicator className="absolute top-3 right-3 text-primary">
              <CircleCheck className="size-5 fill-primary text-primary-foreground" aria-hidden />
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
});

export default DepartmentPicker;

/** Loading tiles shaped like the real ones */
export function DepartmentPickerSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-16 items-start gap-3 rounded-xl border border-border bg-background p-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2.5 py-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
