import type { TicketPriority } from "./ticket.types";

/** One extra field on the new request form (page 39, 63). Answers land in ticket.extra_fields[key]. */
export interface CategoryField {
  /** snake_case key in ticket.extra_fields, e.g. "software_name" */
  key: string;
  /** Sentence case label, e.g. "Software name" */
  label: string;
  type: "text" | "number" | "long_text" | "date";
  required: boolean;
  /** Help text under the input */
  help?: string;
  /** Shown inside the input on the right, e.g. "ZAR" */
  unit?: string;
}

export type CategoryKind = "fix" | "request";

export interface Category {
  category_id: number;
  category_name: string;
  department_id: number;
  department_name: string;
  /** "fix" = Something is broken, "request" = I need something */
  kind: CategoryKind;
  /** lucide icon name in kebab case, e.g. "wifi" */
  icon: string;
  description: string | null;
  default_priority: TicketPriority;
  needs_approval: boolean;
  fields: CategoryField[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}
