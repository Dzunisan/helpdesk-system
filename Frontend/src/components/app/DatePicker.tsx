import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "2026-11-20" -> a local Date at midnight (what the calendar works with) */
const toLocalDate = (value: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};

/** A picked calendar day -> "2026-11-20" */
const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "2026-11-20" -> "Fri 20 Nov 2026" (SAST house style, p.31) */
const formatDay = (value: string) => {
  const day = formatSast(`${value}T12:00:00+02:00`, "day", "");
  return day ? `${day} ${value.slice(0, 4)}` : value;
};

interface DatePickerProps {
  /** "YYYY-MM-DD", or "" for no date */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Adds a small x that clears the date */
  clearable?: boolean;
  /** Days before this one can't be picked (e.g. today for "Needed by") */
  fromDate?: Date;
  /** Days after this one can't be picked (e.g. today for a filter on past messages) */
  toDate?: Date;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * A date field built from shadcn Popover + Calendar (briefing p.34): the button shows the day in
 * SAST style ("Fri 20 Nov 2026"), the calendar opens below it. Values are plain "YYYY-MM-DD"
 * strings, the same as a native date input, so forms and API params don't change.
 */
export default function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  clearable,
  fromDate,
  toDate,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toLocalDate(value);
  const disabled = [
    ...(fromDate ? [{ before: fromDate }] : []),
    ...(toDate ? [{ after: toDate }] : []),
  ];

  return (
    <div className={cn("relative flex", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={aria["aria-label"]}
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            className={cn(
              "h-10 w-full justify-start gap-2 px-3 font-normal sm:h-9",
              !selected && "text-muted-foreground",
              clearable && selected && "pr-9",
            )}
          >
            <CalendarDays data-icon="inline-start" className="text-muted-foreground" />
            <span className="truncate">{selected ? formatDay(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={disabled.length ? disabled : undefined}
            weekStartsOn={1}
            onSelect={(date) => {
              onChange(date ? toIsoDay(date) : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear the date"
          className="absolute top-1/2 right-2 -translate-y-1/2"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
