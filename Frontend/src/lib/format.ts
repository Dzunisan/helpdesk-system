/**
 * Date, time and reference formatting for every page.
 * All times are shown in South African time (SAST, Africa/Johannesburg),
 * whatever the viewer's computer is set to.
 */

const TIME_ZONE = "Africa/Johannesburg";

export type DateInput = string | number | Date | null | undefined;

/**
 * - `dateTime` "Fri 13 Nov, 09:02" (default; lists, timelines)
 * - `day`      "Fri 13 Nov"         (submitted / created columns)
 * - `date`     "13 Nov 2026"        (profiles, "member since")
 * - `time`     "09:02"
 * - `full`     "Fri 13 Nov 2026, 09:02" (detail panels, tooltips)
 * - `long`     "Friday, 13 November"     (page subtitles, greetings)
 * - `smart`    "Today, 09:02" / "Yesterday, 16:40" / "Fri 13 Nov, 09:02" /
 *              "Fri 13 Nov 2025, 09:02" (older than this year)
 */
export type SastStyle = "dateTime" | "day" | "date" | "time" | "full" | "long" | "smart";

/**
 * The pieces of a date in SAST. Built from parts rather than a locale string, because
 * en-ZA zero-pads the day ("08 Nov") and en-GB writes "Sept"; the house style is
 * "Sun, 8 Nov" and "Sep" on every machine.
 */
interface SastParts {
  weekday: string;
  weekdayLong: string;
  day: string;
  month: string;
  monthLong: string;
  year: string;
  hour: string;
  minute: string;
  /** "2026-11-13": the calendar day in SAST, for comparing days */
  key: string;
}

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const LONG_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long" });
const MONTH_NUMBER = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "2-digit" });

const sastParts = (date: Date): SastParts => {
  const get = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const short = PARTS_FORMAT.formatToParts(date);
  const long = LONG_FORMAT.formatToParts(date);
  const day = String(Number(get(short, "day")));
  const year = get(short, "year");
  return {
    weekday: get(short, "weekday"),
    weekdayLong: get(long, "weekday"),
    day,
    month: get(short, "month"),
    monthLong: get(long, "month"),
    year,
    hour: get(short, "hour"),
    minute: get(short, "minute"),
    key: `${year}-${MONTH_NUMBER.format(date)}-${day.padStart(2, "0")}`,
  };
};

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const render = (p: SastParts, style: Exclude<SastStyle, "smart">): string => {
  const time = `${p.hour}:${p.minute}`;
  switch (style) {
    case "dateTime":
      return `${p.weekday} ${p.day} ${p.month}, ${time}`;
    case "day":
      return `${p.weekday} ${p.day} ${p.month}`;
    case "date":
      return `${p.day} ${p.month} ${p.year}`;
    case "time":
      return time;
    case "full":
      return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${time}`;
    case "long":
      return `${p.weekdayLong}, ${p.day} ${p.monthLong}`;
  }
};

/**
 * Format a date in SAST. Returns `fallback` ("—") for missing or invalid dates.
 * @example formatSast(ticket.created_at)          // "Tue 10 Nov, 09:02" (the house format, p.13/p.31)
 * @example formatSast(ticket.created_at, "day")   // "Tue 10 Nov"
 */
export function formatSast(value: DateInput, style: SastStyle = "dateTime", fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  const parts = sastParts(date);

  if (style === "smart") {
    const now = new Date();
    const today = sastParts(now).key;
    const time = render(parts, "time");
    if (parts.key === today) return `Today, ${time}`;
    if (parts.key === sastParts(new Date(now.getTime() - 86_400_000)).key) return `Yesterday, ${time}`;
    return render(parts, parts.key.slice(0, 4) === today.slice(0, 4) ? "dateTime" : "full");
  }

  return render(parts, style);
}

/**
 * Compact age of something, for "Age" columns: "just now", "25m", "2h 10m", "3d".
 * @example formatAge(ticket.created_at) // "2h 10m"
 */
export function formatAge(value: DateInput, now: DateInput = new Date(), fallback = "—"): string {
  const date = toDate(value);
  const end = toDate(now);
  if (!date || !end) return fallback;
  const minutes = Math.max(0, Math.floor((end.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Relative time for meta lines: "just now", "25m ago", "2h ago", "3d ago",
 * then the SAST date ("13 Nov 2026") after a week.
 */
export function formatAgo(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatSast(date, "date", fallback);
}

/**
 * Compact duration for chips and targets, a zero remainder dropped: "25m", "1h", "1h 54m", "3d", "2d 3h".
 * @example formatDuration(240) // "4h"
 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
  const days = Math.floor(m / (24 * 60));
  const hours = Math.floor((m % (24 * 60)) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * A duration in words, for sentences: "30 min", "1 hour", "4 hours", "1 h 30 min", "1 day", "3 days".
 * @example formatDurationWords(1440) // "1 day"
 */
export function formatDurationWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m >= 1440 && m % 1440 === 0) return m === 1440 ? "1 day" : `${m / 1440} days`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} h ${rest} min`;
}

/** First name only: "Thabo Nkosi" -> "Thabo"; `fallback` when there is no name */
export const firstNameOf = (name: string | null | undefined, fallback = ""): string =>
  name?.trim().split(/\s+/)[0] || fallback;

/** "HD-1048": the one way a ticket number is written */
export const formatTicketRef = (id: number | string): string => `HD-${id}`;

/** Initials for an avatar: "Thabo Nkosi" -> "TN", "Lerato" -> "LE", "" -> "?" */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
