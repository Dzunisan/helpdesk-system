import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { lastDays, rangeLabel, startOfDay, type DayRange } from "@/lib/dayRange";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value: DayRange;
  onChange: (range: DayRange) => void;
  /** Quick picks in days, e.g. [7, 30, 90] */
  presets?: readonly number[];
  className?: string;
  "aria-label"?: string;
}

/**
 * Date range from shadcn Popover + Calendar (briefing p.53 "Resolved by me" period): quick picks for
 * the last 7 / 30 / 90 days, or any range on the calendar (no future days). Two months side by side
 * on wide screens, one on phones.
 */
export default function DateRangePicker({ value, onChange, presets = [7, 30, 90], className, ...aria }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // While picking, the calendar holds a half-finished range of its own
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const today = startOfDay(new Date());
  const months = typeof window !== "undefined" && window.innerWidth >= 640 ? 2 : 1;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setDraft(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={aria["aria-label"]}
          className={cn("h-10 justify-start gap-2 px-3 font-normal sm:h-9", className)}
        >
          <CalendarDays data-icon="inline-start" className="text-muted-foreground" />
          <span className="truncate tabular-nums">{rangeLabel(value, presets)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-wrap gap-2 p-3">
          {presets.map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={rangeLabel(value, presets) === `Last ${days} days` ? "secondary" : "ghost"}
              onClick={() => {
                onChange(lastDays(days));
                setOpen(false);
              }}
            >
              Last {days} days
            </Button>
          ))}
        </div>
        <Separator />
        <Calendar
          mode="range"
          selected={draft ?? { from: value.from, to: value.to }}
          // Two months end on this month; one month (phones) is this month
          defaultMonth={new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)}
          numberOfMonths={months}
          disabled={{ after: today }}
          weekStartsOn={1}
          onSelect={(range, picked) => {
            // First click starts a new range; the second click finishes it
            if (!draft) {
              setDraft({ from: picked, to: undefined });
              return;
            }
            if (range?.from && range.to) {
              onChange({ from: startOfDay(range.from), to: startOfDay(range.to) });
              setDraft(undefined);
              setOpen(false);
            } else {
              setDraft(range);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
