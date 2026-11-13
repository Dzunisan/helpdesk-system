/**
 * Sprint 1 API contract types (docs/api-sprint-1.md). The backend implements exactly these shapes;
 * every client in src/services/{tickets,users,departments,categories,slaPolicies}.ts returns them.
 * Times are ISO 8601 strings in UTC; show them in SAST with lib/format.ts. User ids are strings
 * (bigint), every other id is a number.
 */

// ---------------------------------------------------------------------------------------------
// Vocabulary (briefing p.4, p.31)
// ---------------------------------------------------------------------------------------------

export type TicketStatus =
  | "Pending approval"
  | "New"
  | "Open"
  | "Waiting on employee"
  | "Resolved"
  | "Closed"
  | "Cancelled";

export const TICKET_STATUSES: TicketStatus[] = [
  "Pending approval",
  "New",
  "Open",
  "Waiting on employee",
  "Resolved",
  "Closed",
  "Cancelled",
];

export type TicketPriority = "Urgent" | "High" | "Normal" | "Low";
export const TICKET_PRIORITIES: TicketPriority[] = ["Urgent", "High", "Normal", "Low"];

/** "How is this affecting you?" (page 39): Blocks me / Slows me down / Minor */
export type TicketImpact = "blocks_me" | "slows_me_down" | "minor";

/** Computed by the server (services/sla.ts slaState): drives SlaChip colour and the Breached view */
export type SlaState = "met" | "breached" | "due_soon" | "on_track";

export type Role = "Employee" | "Agent" | "Department Lead" | "System Admin" | "Platform Admin";

/** "Something is broken" (fix) or "I need something" (request) */
export type CategoryKind = "fix" | "request";

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Body of every 4xx/5xx response */
export interface ApiErrorBody {
  message: string;
  /** 400 validation: one readable line per problem */
  errors?: string[];
  /** 400 from POST /api/tickets: extra field key -> problem, e.g. { software_name: "Software name is required." } */
  field_errors?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------------------------

export interface Ticket {
  ticket_id: number;
  title: string;
  description: string | null;
  ticket_department_id: number;
  department_name: string | null;
  ticket_category_id: number;
  category_name: string | null;
  /** lucide icon name in kebab case, e.g. "wifi" */
  category_icon: string | null;
  category_kind: CategoryKind | null;
  ticket_priority: TicketPriority;
  ticket_status: TicketStatus;
  impact: TicketImpact | null;
  /** Answers to the category's extra fields, keyed by CategoryField.key */
  extra_fields: Record<string, string | number | null>;
  requester_id: string;
  requester_name: string | null;
  requester_email: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  reopen_count: number;
  resolution_note: string | null;
  /** null while Pending approval: the clocks start when the lead approves */
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_response_at: string | null;
  sla_state: SlaState;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** GET /api/tickets query. The server scopes by role first; these only narrow the result. */
export interface TicketListParams {
  /** One status or several (sent comma-separated): ["Open", "Waiting on employee"] */
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority;
  /** A user id, "me" (the caller) or "none" (unassigned) */
  assignee_id?: string | "me" | "none";
  /** The requester (staff only) */
  creator_id?: string;
  category_id?: number;
  /** Matches title, description, requester name and "HD-1048" */
  search?: string;
  /** "due" = nearest unmet due time first, breached first (S3). Default "created" (newest first). */
  sort?: "due" | "created" | "updated";
  /** Only tickets in this SLA state (S3): the Breached view is sla=breached */
  sla?: "breached" | "due_soon";
  /** Employees only; ignored for Agents and Leads (their department comes from the server) */
  department_id?: number;
  page?: number;
  /** 1-100, default 10 */
  limit?: number;
}

export interface TicketListResponse {
  tickets: Ticket[];
  pagination: Pagination;
}

export interface TicketResponse {
  ticket: Ticket;
}

/** POST /api/tickets. Department, priority and status come from the category; never sent. */
export interface CreateTicketRequest {
  category_id: number;
  title: string;
  description: string;
  impact?: TicketImpact;
  extra_fields?: Record<string, string | number | null>;
}

/** PATCH /api/tickets/:id/assign (lead; an agent may only name themselves, same as /claim) */
export interface AssignTicketRequest {
  assignee_id: string;
  /** Why it moved, shown in the timeline ("reassigned: Thabo is on leave") */
  note?: string;
}

/** POST /api/tickets/:id/transition */
export interface TransitionRequest {
  to: TicketStatus;
  /** Required when to = "Resolved" (stored as resolution_note); optional otherwise */
  note?: string;
}

/** What GET /api/tickets/:id/actions may return: the buttons this user may see right now */
export type TicketAction =
  | "claim" // New, unassigned, caller is an Agent/Lead of the department
  | "assign" // caller is the department's lead (New, Open, Waiting on employee)
  | "change_priority" // department staff, ticket not Closed/Cancelled
  | "reply" // requester or department staff, ticket not Closed/Cancelled
  | "internal_note" // department staff, ticket not Closed/Cancelled
  | "wait" // Open -> Waiting on employee (owner or lead)
  | "resume" // Waiting on employee -> Open (owner or lead; the requester's reply does it automatically)
  | "resolve" // Open -> Resolved (owner or lead), note required
  | "confirm_fixed" // Resolved -> Closed (requester): "Yes, it's fixed"
  | "still_broken" // Resolved -> Open within 5 days (requester): reopen_count + 1
  | "cancel" // New or Pending approval -> Cancelled (requester)
  | "approve" // Pending approval -> New (lead; S6, Sprint 2)
  | "reject"; // Pending approval -> Cancelled with a reason (lead; S6, Sprint 2)

export interface TicketActionsResponse {
  actions: TicketAction[];
  /** Every status this user may move the ticket to right now (TRANSITIONS on the server) */
  transitions: TicketStatus[];
  /** Resolved tickets: when "Still broken" stops being offered and the ticket closes on its own */
  reopen_until: string | null;
}

/** PATCH /api/tickets/:id/priority */
export interface ChangePriorityRequest {
  priority: TicketPriority;
}

// ---------------------------------------------------------------------------------------------
// Timeline and comments (S4)
// ---------------------------------------------------------------------------------------------

export type TicketEventType =
  | "created"
  | "claimed"
  | "assigned"
  | "status_changed"
  | "priority_changed"
  | "approved"
  | "rejected"
  | "reopened"
  | "comment_deleted";

export interface TimelinePerson {
  user_id: string;
  name: string;
  role: Role;
  department_name: string | null;
}

export interface TimelineEvent {
  kind: "event";
  /** "e-<event_id>", unique across the merged list */
  id: string;
  at: string;
  /** null = the system (e.g. closed after 5 days) */
  actor: TimelinePerson | null;
  type: TicketEventType;
  from_value: string | null;
  to_value: string | null;
  /** Readable from/to: user names for claimed/assigned (values are user ids), otherwise the value */
  from_label: string | null;
  to_label: string | null;
  note: string | null;
  /** Staff only; never sent to employees */
  is_internal: boolean;
}

export interface TimelineComment {
  kind: "comment";
  /** "c-<comment_id>" */
  id: string;
  at: string;
  actor: TimelinePerson;
  comment_id: number;
  /** null when deleted: show "Message removed by <actor.name>" */
  body: string | null;
  is_internal: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  /** The caller wrote it and it is under 15 minutes old */
  can_edit: boolean;
}

export type TimelineItem = TimelineEvent | TimelineComment;

/** Oldest first. Employees never receive internal comments or internal events. */
export interface TimelineResponse {
  items: TimelineItem[];
}

export interface Comment {
  comment_id: number;
  ticket_id: number;
  author_id: string;
  author_name: string;
  author_role: Role;
  /** null when deleted */
  body: string | null;
  is_internal: boolean;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/** POST /api/tickets/:id/comments */
export interface AddCommentRequest {
  body: string;
  /** Internal note (staff of the ticket's department only) */
  is_internal?: boolean;
}

export interface CommentResponse {
  comment: Comment;
}

// ---------------------------------------------------------------------------------------------
// Users (S1)
// ---------------------------------------------------------------------------------------------

export interface User {
  user_id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  active: boolean;
  /** Required for Employee, Agent and Department Lead; null for admins */
  department_id: number | null;
  department_name: string | null;
  /** The department this user leads (Department Leads only) */
  led_department_id: number | null;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface UserListParams {
  role?: Role;
  department_id?: number;
  active?: boolean;
  search?: string;
}

export interface UserListResponse {
  users: User[];
}

/** POST /api/users. The server emails a temporary password and sets must_change_password. */
export interface CreateUserRequest {
  name: string;
  surname: string;
  email: string;
  role: Role;
  department_id: number | null;
}

/** PATCH /api/users/:id */
export interface UpdateUserRequest {
  name?: string;
  surname?: string;
  email?: string;
  role?: Role;
  department_id?: number | null;
}

export interface UserResponse {
  user: User;
}

/** POST /api/auth/change-password (first sign-in and the profile page) */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// ---------------------------------------------------------------------------------------------
// Departments (S1)
// ---------------------------------------------------------------------------------------------

export interface Department {
  department_id: number;
  department_name: string;
  description: string | null;
  status: "active" | "inactive";
  lead_id: string | null;
  /** "Thandi Mthembu", or null without a lead */
  departmentLead: string | null;
  lead_name: string | null;
  lead_surname: string | null;
  lead_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentListParams {
  status?: "active" | "inactive";
  search?: string;
  page?: number;
  /** Default 10; the UI asks for 100 */
  limit?: number;
}

export interface DepartmentListResponse {
  departments: Department[];
  pagination: Pagination;
}

/** PUT /api/departments/:id/lead */
export interface AppointLeadRequest {
  lead_id: string;
}

export interface DepartmentResponse {
  department: Department;
}

// ---------------------------------------------------------------------------------------------
// Categories (S5)
// ---------------------------------------------------------------------------------------------

export interface CategoryField {
  /** snake_case key in ticket.extra_fields */
  key: string;
  /** Sentence case label */
  label: string;
  type: "text" | "number" | "long_text" | "date";
  required: boolean;
  /** Help text under the input */
  help?: string;
  /** Shown inside the input on the right, e.g. "ZAR" */
  unit?: string;
}

export interface Category {
  category_id: number;
  category_name: string;
  department_id: number;
  department_name: string;
  kind: CategoryKind;
  /** lucide icon name in kebab case, e.g. "wifi", "key-round" */
  icon: string;
  description: string | null;
  default_priority: TicketPriority;
  /** Starts in Pending approval; shows the violet "Needs approval" tag */
  needs_approval: boolean;
  fields: CategoryField[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryGroup {
  department_id: number;
  department_name: string;
  categories: Category[];
}

export interface CategoryListResponse {
  /** Sorted by department, kind, name */
  categories: Category[];
  /** The same categories grouped by department */
  departments: CategoryGroup[];
}

export interface CreateCategoryRequest {
  category_name: string;
  department_id: number;
  kind: CategoryKind;
  icon: string;
  description?: string | null;
  default_priority: TicketPriority;
  needs_approval: boolean;
  fields: CategoryField[];
  active?: boolean;
}

/** PATCH /api/categories/:id: any subset; deactivate with { active: false } (no delete) */
export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;

export interface CategoryResponse {
  category: Category;
}

// ---------------------------------------------------------------------------------------------
// SLA policies (S3)
// ---------------------------------------------------------------------------------------------

export interface SlaPolicy {
  priority: TicketPriority;
  first_response_mins: number;
  resolution_mins: number;
  updated_at: string;
}

/** Ordered Urgent, High, Normal, Low */
export interface SlaPolicyListResponse {
  policies: SlaPolicy[];
}

/** PUT /api/sla-policies/:priority. Affects new tickets and later priority changes only. */
export interface UpdateSlaPolicyRequest {
  first_response_mins: number;
  resolution_mins: number;
}

export interface SlaPolicyResponse {
  policy: SlaPolicy;
}
