/**
 * One status and priority vocabulary for every page (briefing p.4, p.31).
 * Pages never colour or label a status/priority themselves: they render
 * <StatusBadge>, <PriorityBadge> or use the labels below.
 */

export type Status =
  | "new"
  | "open"
  | "waiting"
  | "pending"
  | "resolved"
  | "closed"
  | "cancelled";

export type Priority = "urgent" | "high" | "normal" | "low";

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  open: "Open",
  waiting: "Waiting on employee",
  pending: "Pending approval",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/**
 * LEGACY MAPPING, the only place that knows the old database values.
 * Until Sprint 1 (S1) renames them in the database:
 *   - legacy "Open" (nobody owns it yet) displays as New
 *   - legacy "In progress" (one agent owns it) displays as Open
 *   - legacy priority "Medium" displays as Normal
 * When the rename lands, delete the "Open" -> new and "In progress" entries
 * (the new value "Open" then means owned) and the "Medium" entry.
 */
const STATUS_FROM_DB: Record<string, Status> = {
  open: "new", // legacy: "Open" = no owner yet
  "in progress": "open", // legacy
  new: "new",
  "waiting on employee": "waiting",
  "pending approval": "pending",
  resolved: "resolved",
  closed: "closed",
  cancelled: "cancelled",
};

const PRIORITY_FROM_DB: Record<string, Priority> = {
  medium: "normal", // legacy
  urgent: "urgent",
  high: "high",
  normal: "normal",
  low: "low",
};

/** Database status value -> display key. Unknown values fall back to "new". */
export const toStatus = (value: string | null | undefined): Status =>
  STATUS_FROM_DB[(value ?? "").trim().toLowerCase()] ?? "new";

/** Database priority value -> display key. Unknown values fall back to "normal". */
export const toPriority = (value: string | null | undefined): Priority =>
  PRIORITY_FROM_DB[(value ?? "").trim().toLowerCase()] ?? "normal";

/** Display label for a database status value, e.g. "In progress" -> "Open". */
export const statusLabel = (value: string | null | undefined): string =>
  STATUS_LABEL[toStatus(value)];

/** Display label for a database priority value, e.g. "Medium" -> "Normal". */
export const priorityLabel = (value: string | null | undefined): string =>
  PRIORITY_LABEL[toPriority(value)];

/** Sort weight: higher is more urgent. */
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};
