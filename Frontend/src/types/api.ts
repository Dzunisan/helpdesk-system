/**
 * Sprint 1 API contract types (docs/api-sprint-1.md); Sprint 2 types are at the end of the file
 * (docs/api-sprint-2.md). The backend implements exactly these shapes;
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
  /** GET /api/tickets/:id only: the requester's rating once the ticket is closed (null until rated) */
  feedback?: TicketFeedback | null;
}

/** The requester's 1-5 rating of a finished ticket (POST /api/tickets/:id/feedback; CSAT reports are S10) */
export interface TicketFeedback {
  feedback_id: number;
  ticket_id: number;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  /** S10: quick tags chosen on the survey ("Fast reply", "Kept me updated", ...) */
  tags?: string[];
  /** S10: the owner and department when the ticket closed (a later move doesn't move the score) */
  agent_id?: string | null;
  department_id?: number | null;
}

/** POST /api/tickets/:id/feedback */
export interface SubmitFeedbackRequest {
  rating: number;
  comment?: string;
}

export interface FeedbackResponse {
  feedback: TicketFeedback;
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

/** POST /api/tickets answers 201 with the new ticket and its reference, e.g. "HD-1054" */
export interface CreateTicketResponse extends TicketResponse {
  reference: string;
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

/** GET /api/tickets/agents: who a ticket can be assigned to (active Agents and Leads of the caller's department) */
export interface Assignee {
  user_id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  department_id: number | null;
  department_name: string | null;
}

export interface AssigneeListResponse {
  agents: Assignee[];
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
  | "comment_deleted"
  /** The author edited a message (the card shows "edited"; no separate line) */
  | "comment_edited"
  /** The requester rated the request: from = previous rating or null, to = 1-5, note = comment */
  | "feedback_given"
  /** S12: from/to = department NAMES. One public event, plus an internal one whose note is the reason */
  | "department_changed"
  /** S14: to = attachment id, note = file name; is_internal follows the file */
  | "attached";

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
  /** S14: files sent with this message (internal ones only reach staff); [] when none */
  attachments: AttachmentSummary[];
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
  /** S14: ids from POST /api/tickets/:id/attachments (the caller's own unsent uploads, at most 5) */
  attachment_ids?: number[];
  /** S7: the macro that filled the composer (use_count + 1; its set_status applies unless set_status is sent) */
  macro_id?: number;
  /** S2/S7: move the ticket with the reply when that arrow is allowed for the caller. null = reply only. */
  set_status?: TicketStatus | null;
}

/** What happened to set_status: a refused move keeps the reply and says why */
export interface SetStatusResult {
  requested: TicketStatus;
  applied: boolean;
  message: string | null;
}

export interface CommentResponse {
  comment: Comment;
  /** Present on POST /comments: null when no status change was asked for */
  set_status?: SetStatusResult | null;
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
  /** "Ask them to set a new password at first sign-in" (page 61); default true */
  must_change_password?: boolean;
}

/** The welcome email the server would have sent, when no email service is configured (shown once) */
export interface SimulatedWelcomeEmail {
  to: string;
  temporary_password: string;
}

/** POST /api/users answers 201 with the user and whether the welcome email went out */
export interface CreateUserResponse extends UserResponse {
  welcome_email_sent: boolean;
  /** Present when welcome_email_sent is false: the admin passes the temporary password on */
  simulated_welcome_email?: SimulatedWelcomeEmail;
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

// =============================================================================================
// SPRINT 2 (docs/api-sprint-2.md). Clients: services/{approvals,macros,reports,notifications,
// feedback,attachments,admin}.ts
// =============================================================================================

// ---------------------------------------------------------------------------------------------
// S6 approvals
// ---------------------------------------------------------------------------------------------

export type ApprovalDecision = "approved" | "rejected";

/** One row of GET /api/approvals: a Pending approval ticket, or a decision (?decided_by=me) */
export interface ApprovalItem {
  ticket: Ticket;
  /** null while pending */
  decision: ApprovalDecision | null;
  /** Approve note or reject reason */
  reason: string | null;
  decided_at: string | null;
  approver_id: string | null;
  approver_name: string | null;
  /** How long it has been waiting (pending) or waited (decided), in minutes */
  waiting_mins: number;
}

export interface ApprovalListParams {
  /** "pending" (default): the queue. Use decided_by=me for the History tab. */
  status?: "pending";
  decided_by?: "me";
  page?: number;
  limit?: number;
}

export interface ApprovalListResponse {
  approvals: ApprovalItem[];
  pagination: Pagination;
}

export interface ApprovalCountResponse {
  pending: number;
}

/** POST /api/tickets/:id/approve */
export interface ApproveRequest {
  note?: string;
}

/** POST /api/tickets/:id/reject (reason required: 400 without it) */
export interface RejectRequest {
  reason: string;
}

// ---------------------------------------------------------------------------------------------
// S7 macros (canned responses)
// ---------------------------------------------------------------------------------------------

/** Placeholders a macro body may use; GET /api/macros/:id/render fills them */
export const MACRO_PLACEHOLDERS = [
  "{{requester.first_name}}",
  "{{ticket.ref}}",
  "{{ticket.title}}",
  "{{agent.first_name}}",
] as const;

export interface Macro {
  id: number;
  department_id: number;
  department_name: string | null;
  title: string;
  /** Raw body with {{placeholders}} */
  body: string;
  /** "Then set status"; null = reply only */
  set_status: TicketStatus | null;
  is_internal: boolean;
  use_count: number;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MacroListParams {
  /** Search in title and body */
  q?: string;
  /** Leads only (macros manager): include deactivated macros */
  include_inactive?: boolean;
}

export interface MacroListResponse {
  macros: Macro[];
}

export interface MacroResponse {
  macro: Macro;
}

/** GET /api/macros/:id/render?ticket=1048 */
export interface RenderedMacro {
  macro_id: number;
  ticket_id: number;
  /** Placeholders replaced, ready for the composer */
  body: string;
  set_status: TicketStatus | null;
  is_internal: boolean;
}

/** POST /api/macros (lead; the department is the lead's own) */
export interface CreateMacroRequest {
  title: string;
  body: string;
  set_status?: TicketStatus | null;
  is_internal?: boolean;
}

/** PATCH /api/macros/:id (lead): any subset; active: false deactivates */
export type UpdateMacroRequest = Partial<CreateMacroRequest> & { active?: boolean };

// ---------------------------------------------------------------------------------------------
// S8 reports (lead dashboard) and S10 CSAT
// ---------------------------------------------------------------------------------------------

/** Lead: ignored (own department forced). System Admin: a department, or none for all. */
export interface ReportParams {
  department_id?: number;
  /** Window for averages and CSAT, default 30 */
  days?: number;
}

/** GET /api/reports/summary: the six KPI tiles (p.17, p.54). Averages are null when there's no data. */
export interface ReportSummary {
  department_id: number | null;
  department_name: string | null;
  days: number;
  backlog: number;
  unassigned: number;
  /** Age of the oldest unassigned ticket in minutes, null when none */
  oldest_unassigned_mins: number | null;
  breached: number;
  breached_first_response: number;
  breached_resolution: number;
  avg_first_response_mins: number | null;
  /** Share of first responses within target, 0-100, null when none */
  first_response_within_target_pct: number | null;
  avg_resolution_mins: number | null;
  resolution_within_target_pct: number | null;
  /** Tickets resolved in the window that were reopened at least once, 0-100 */
  reopen_rate_pct: number | null;
  /** 4-5 stars / all ratings in the window, 0-100, null when no ratings */
  csat_pct: number | null;
  csat_responses: number;
  pending_approvals: number;
  oldest_pending_approval_mins: number | null;
}

/** GET /api/reports/workload: one row per agent of the department */
export interface WorkloadRow {
  user_id: string;
  name: string;
  role: Role;
  open: number;
  waiting: number;
  breached: number;
  resolved_7d: number;
  /** CSAT of their rated tickets in the window, null when none */
  csat_pct: number | null;
}

export interface WorkloadResponse {
  agents: WorkloadRow[];
}

/** GET /api/reports/breaches: top 10 overdue (and due soon) live tickets */
export interface BreachesResponse {
  tickets: Ticket[];
}

export interface DailyPoint {
  /** YYYY-MM-DD in SAST */
  date: string;
  created: number;
  resolved: number;
}

/** GET /api/reports/daily?days=14 */
export interface DailyResponse {
  days: DailyPoint[];
}

export interface CsatAgentRow {
  user_id: string;
  name: string;
  responses: number;
  csat_pct: number | null;
  avg_rating: number | null;
}

export interface CsatRecentFeedback {
  feedback_id: number;
  ticket_id: number;
  ticket_title: string;
  rating: number;
  comment: string | null;
  tags: string[];
  requester_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  created_at: string;
}

/** GET /api/reports/csat?days=30 */
export interface CsatReport {
  department_id: number | null;
  days: number;
  responses: number;
  csat_pct: number | null;
  avg_rating: number | null;
  /** Count per star, index 0 = 1 star */
  distribution: [number, number, number, number, number];
  by_agent: CsatAgentRow[];
  recent: CsatRecentFeedback[];
}

// ---------------------------------------------------------------------------------------------
// S9 notifications, preferences, outbox and jobs
// ---------------------------------------------------------------------------------------------

export type NotificationType =
  | "reply_added"
  | "assigned"
  | "status_changed"
  | "approval_waiting"
  | "approval_decided"
  | "sla_breached"
  | "low_csat"
  | "csat_requested"
  | "department_changed";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "reply_added",
  "assigned",
  "status_changed",
  "approval_waiting",
  "approval_decided",
  "sla_breached",
  "low_csat",
  "csat_requested",
  "department_changed",
];

export interface AppNotification {
  /** bigserial: a string */
  notification_id: string;
  type: NotificationType;
  title: string;
  /** Optional plain-text second line */
  body: string | null;
  ticket_id: number | null;
  actor: { user_id: string; name: string } | null;
  read_at: string | null;
  created_at: string;
  /** Where clicking it goes for this user (role-specific ticket page, or the CSAT survey) */
  path: string | null;
}

export interface NotificationListParams {
  /** true: unread only */
  unread?: boolean;
  /** Default 30, max 100 */
  limit?: number;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unread: number;
}

export interface NotificationCountResponse {
  unread: number;
}

export interface NotificationPref {
  type: NotificationType;
  /** Human label, e.g. "Replies on my tickets" */
  label: string;
  email: boolean;
}

export interface NotificationPrefsResponse {
  prefs: NotificationPref[];
}

/** PUT /api/me/notification-prefs */
export interface SaveNotificationPrefsRequest {
  prefs: { type: NotificationType; email: boolean }[];
}

export type OutboxStatus = "QUEUED" | "SENT" | "FAILED" | "SIMULATED";
export type OutboxChannel = "email" | "sms" | "whatsapp" | "push";

export interface OutboxMessage {
  id: string;
  channel: OutboxChannel;
  recipient: string;
  recipient_name: string | null;
  subject: string;
  status: OutboxStatus;
  error: string | null;
  ticket_id: number | null;
  /** The list leaves out the HTML body to stay small */
  created_at: string;
  sent_at: string | null;
}

export interface OutboxListParams {
  status?: OutboxStatus;
  channel?: OutboxChannel;
  /** YYYY-MM-DD (SAST); default all */
  date?: string;
  page?: number;
  limit?: number;
}

export interface OutboxListResponse {
  messages: OutboxMessage[];
  pagination: Pagination;
  /** Totals per status for the filter chips */
  counts: Record<OutboxStatus, number>;
}

/** POST /api/admin/jobs/run */
export interface JobsResult {
  closed: number;
  breach_alerts: number;
  emails: { sent: number; failed: number; simulated: number };
  ran_at: string;
}

export interface RunJobsResponse {
  message: string;
  result: JobsResult;
}

// ---------------------------------------------------------------------------------------------
// S10 CSAT survey (per ticket)
// ---------------------------------------------------------------------------------------------

/** Quick tags on the survey (p.19, p.43) */
export const CSAT_TAGS = ["Fast reply", "Kept me updated", "Fixed first time", "Friendly"] as const;
export type CsatTag = (typeof CSAT_TAGS)[number];

/** POST /api/tickets/:id/feedback (Sprint 2): once; 409 when already rated or not Closed */
export interface SubmitCsatRequest {
  rating: number;
  tags?: CsatTag[];
  comment?: string;
}

// ---------------------------------------------------------------------------------------------
// S12 move to another department
// ---------------------------------------------------------------------------------------------

/** PATCH /api/tickets/:id/department */
export interface MoveDepartmentRequest {
  department_id: number;
  category_id: number;
  /** Internal, required (400 without it) */
  reason: string;
  /** Public message to the requester (pre-filled, editable) */
  message?: string;
}

/** GET /api/departments/:id/categories */
export interface DepartmentCategoriesResponse {
  categories: Category[];
}

// ---------------------------------------------------------------------------------------------
// S14 attachments
// ---------------------------------------------------------------------------------------------

/** Server limits (p.21); the browser checks the same before uploading */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export interface AttachmentSummary {
  attachment_id: number;
  /** null until sent with a comment */
  comment_id: number | null;
  /** Display as text only, never as HTML */
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_internal: boolean;
  /** Images have GET /api/attachments/:id/thumb */
  is_image: boolean;
  uploader_id: string;
  created_at: string;
}

/** POST /api/tickets/:id/attachments -> 201 */
export interface UploadAttachmentsResponse {
  attachments: AttachmentSummary[];
}
