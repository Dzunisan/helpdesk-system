/** Duration helpers for the SLA policies page (targets are stored in minutes) */

export type DurationUnit = "min" | "hours" | "days";

export interface DurationDraft {
  /** What the admin typed, kept as text so a half-typed value isn't lost */
  value: string;
  unit: DurationUnit;
}

const PER_UNIT: Record<DurationUnit, number> = { min: 1, hours: 60, days: 1440 };

export const UNIT_LABEL: Record<DurationUnit, string> = { min: "minutes", hours: "hours", days: "days" };

/** 240 -> { 4, hours }, 4320 -> { 3, days }, 30 -> { 30, min } */
export const draftFromMinutes = (mins: number): DurationDraft =>
  mins >= 1440 && mins % 1440 === 0 && mins !== 1440
    ? { value: String(mins / 1440), unit: "days" }
    : mins % 60 === 0
      ? { value: String(mins / 60), unit: "hours" }
      : { value: String(mins), unit: "min" };

/** Whole minutes, or null when the value isn't a positive number */
export const minutesOf = (draft: DurationDraft): number | null => {
  const n = Number(draft.value);
  if (!draft.value.trim() || !Number.isFinite(n) || n <= 0) return null;
  const mins = Math.round(n * PER_UNIT[draft.unit]);
  return mins > 0 ? mins : null;
};

/** 30 -> "30 min", 60 -> "1 hour", 4320 -> "3 days", 90 -> "1 h 30 min" (lib/format) */
export { formatDurationWords as formatMinutes } from "@/lib/format";
