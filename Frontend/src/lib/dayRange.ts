import { formatSast } from "@/lib/format";

// Day ranges for the date range picker (components/app/DateRangePicker.tsx) and the pages using it.

export interface DayRange {
  /** First day, local midnight */
  from: Date;
  /** Last day (inclusive), local midnight */
  to: Date;
}

const DAY_MS = 86_400_000;
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** The last `days` days up to today: today and the days before it */
export const lastDays = (days: number, today = new Date()): DayRange => {
  const to = startOfDay(today);
  return { from: new Date(to.getTime() - (days - 1) * DAY_MS), to };
};

/** True when `at` falls on a day inside the range (both ends included) */
export const inDayRange = (at: string | number | Date, range: DayRange): boolean => {
  const ms = new Date(at).getTime();
  return ms >= range.from.getTime() && ms < startOfDay(range.to).getTime() + DAY_MS;
};

/** "Last 30 days" for a preset, otherwise "3 Nov – 13 Nov" (SAST style) */
export const rangeLabel = (range: DayRange, presets: readonly number[]): string => {
  const preset = presets.find((d) => {
    const p = lastDays(d);
    return sameDay(p.from, range.from) && sameDay(p.to, range.to);
  });
  if (preset) return `Last ${preset} days`;
  const day = (d: Date) => formatSast(d, "date").replace(/ \d{4}$/, "");
  return sameDay(range.from, range.to) ? day(range.from) : `${day(range.from)} – ${day(range.to)}`;
};

