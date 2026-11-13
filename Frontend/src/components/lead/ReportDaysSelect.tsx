import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REPORT_DAY_OPTIONS, type ReportDays } from "./reportFormat";

/** "Last 30 days": the window for averages, CSAT and top categories (p.54 date range Select) */
export default function ReportDaysSelect({
  value,
  onValueChange,
  className,
}: {
  value: ReportDays;
  onValueChange: (days: ReportDays) => void;
  className?: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onValueChange(Number(v) as ReportDays)}>
      <SelectTrigger aria-label="Date range" className={cn("h-10 w-full sm:h-9 sm:w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {REPORT_DAY_OPTIONS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            Last {d} days
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
