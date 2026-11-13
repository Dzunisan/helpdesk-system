/**
 * One status and priority vocabulary for every page (briefing p.4, p.31).
 * Pages never colour or label a status/priority themselves: they render
 * <StatusBadge>, <PriorityBadge> or use the labels below.
 */
import type { TicketPriority, TicketStatus } from "@/types/api";

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

/** Stored status (db/migrations/001_lifecycle.sql) -> display key */
const STATUS_FROM_DB: Record<TicketStatus, Status> = {
  "Pending approval": "pending",
  New: "new",
  Open: "open",
  "Waiting on employee": "waiting",
  Resolved: "resolved",
  Closed: "closed",
  Cancelled: "cancelled",
};

/** Stored priority -> display key */
const PRIORITY_FROM_DB: Record<TicketPriority, Priority> = {
  Urgent: "urgent",
  High: "high",
  Normal: "normal",
  Low: "low",
};

/** Display key -> stored value, for filters and requests */
export const STATUS_VALUE: Record<Status, TicketStatus> = {
  pending: "Pending approval",
  new: "New",
  open: "Open",
  waiting: "Waiting on employee",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const PRIORITY_VALUE: Record<Priority, TicketPriority> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Database status value -> display key. Unknown values fall back to "new". */
export const toStatus = (value: string | null | undefined): Status =>
  STATUS_FROM_DB[(value ?? "") as TicketStatus] ?? "new";

/** Database priority value -> display key. Unknown values fall back to "normal". */
export const toPriority = (value: string | null | undefined): Priority =>
  PRIORITY_FROM_DB[(value ?? "") as TicketPriority] ?? "normal";

/** Display label for a database status value, e.g. "Waiting on employee" */
export const statusLabel = (value: string | null | undefined): string =>
  STATUS_LABEL[toStatus(value)];

/** Display label for a database priority value, e.g. "Normal" */
export const priorityLabel = (value: string | null | undefined): string =>
  PRIORITY_LABEL[toPriority(value)];

/** Sort weight: higher is more urgent. */
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};
