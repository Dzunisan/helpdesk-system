# Sprint 1 API contract (S1-S5)

The one agreement between the backend and the frontend for Sprint 1 (briefing pages 10-14).
Backend work implements exactly these shapes; frontend work calls them only through
`Frontend/src/services/{tickets,users,departments,categories,slaPolicies}.ts`, whose request and
response types live in `Frontend/src/types/api.ts`. If you need to change a shape, change this file,
`types/api.ts` and the server in the same pull request.

**Status column:** every Sprint 1 endpoint below is `ready` (integrated on `feature/briefing`,
Fri 13 Nov). `legacy` marks older paths kept only until the screens that call them are rebuilt.

## Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `${VITE_API_URL}/api`, e.g. `http://localhost:5000/api` |
| Auth | httpOnly cookie `session` from `POST /api/auth/login`. Send it with every call (`withCredentials`, already set in `services/apiClient.ts`). |
| Ids | User ids are **strings** (bigint). Ticket, department, category and comment ids are numbers. The UI shows tickets as `HD-` + `ticket_id` (`formatTicketRef`). |
| Times | ISO 8601 in UTC (`2026-11-10T06:14:00.000Z`). The UI shows SAST with `lib/format.ts`, e.g. "Tue 10 Nov, 09:02". |
| Statuses | `Pending approval`, `New`, `Open`, `Waiting on employee`, `Resolved`, `Closed`, `Cancelled` (exact spelling). |
| Priorities | `Urgent`, `High`, `Normal`, `Low`. |
| Errors | Every 4xx/5xx body is `{ "message": string, "errors"?: string[], "field_errors"?: { [fieldKey]: string } }`. The clients throw `ApiError` with `status`, `message`, `errors`, `fieldErrors`. |
| 400 | Invalid body or query (bad id, unknown status, missing required field). `message` is readable, `errors` lists each problem. |
| 401 | Not signed in, session expired, or **account deactivated** (blocked on the very next request). The frontend signs the user out. |
| 403 | Signed in, can see the thing, but the role or person may not do this (an agent who isn't the owner changing an Open ticket). |
| 404 | Doesn't exist **or the caller may not see it**. Tickets never answer 403 to someone outside the department: "Ticket not found." so we never admit it exists. |
| 409 | The request is valid but the state forbids it: a move that isn't an arrow in `TRANSITIONS`, already claimed, commenting on a Closed ticket, duplicate email, a lead who already leads another department. |

## Server building blocks (use these, don't duplicate them)

| File | What |
| --- | --- |
| `Backend/src/services/ticketAccess.ts` | `loadTicketAccess(user)`, `canView`, `canWork`, `isRequester`, `ticketScopeCondition`. Employee = own tickets; Agent = own department; Lead = department they lead or belong to; System Admin = counts only; Platform Admin = none. |
| `Backend/src/types/ticket.types.ts` | `TRANSITIONS` (from -> `[{ to, who }]`), `checkTransition(user, ticket, to)` -> `{ ok } \| { ok:false, status: 403\|409, message }`, `canTransition`, `allowedTransitions`, `REOPEN_WINDOW_DAYS = 5`. |
| `Backend/src/services/events.ts` | `logEvent(client, { ticketId, actorId, type, from, to, note, isInternal })`. Always with the transaction client. |
| `Backend/src/config/database.ts` | `withTransaction(async (client) => ...)`: BEGIN / COMMIT / ROLLBACK. |
| `Backend/src/services/sla.ts` | `loadSlaPolicies`, `computeDueTimes(createdAt, priority, policies)`, `slaState(ticket, now)` -> `met \| breached \| due_soon \| on_track`, `nextDueAt`, and the SQL fragments `SQL_NEXT_DUE`, `SQL_IS_BREACHED` (alias `t`). |

**Every change writes exactly one timeline event per fact** (claim, assign, status, priority,
approve, reject, reopen, comment edited, comment deleted, rating) inside the same transaction as the
change. One action can be two facts: a claim (or a lead assigning a New ticket) logs `claimed` /
`assigned` **and** `status_changed` New -> Open, and "Still broken" logs `reopened` **and**
`status_changed` Resolved -> Open. Page 13's "exactly one event" is read per fact; the timeline UI
folds the pair into one line, so the demo shows one entry per action.

**Lead powers** (assign, approve, reject, the `lead` arrows) belong to the department whose
`department.lead_id` is the user. A user with the Department Lead role who leads no department
(just promoted, or replaced through `PUT /departments/:id/lead`) only has agent-level access to
their own `users.department_id`.

### The lifecycle (page 4)

| From | To | Who | How |
| --- | --- | --- | --- |
| Pending approval | New | lead | approve (S6, Sprint 2) |
| Pending approval | Cancelled | lead, requester | reject with reason (S6) / employee withdraws |
| New | Open | agent or lead of the department | `POST /claim` or `PATCH /assign` only (sets the owner in the same transaction) |
| New | Cancelled | requester | Cancel |
| Open | Waiting on employee | owner, lead | asks a question |
| Open | Resolved | owner, lead | resolve with a note (required) |
| Waiting on employee | Open | requester, owner, lead | the requester's public reply does it automatically |
| Resolved | Closed | requester, system | "Yes, it's fixed" / 5 days pass (check on read is fine) |
| Resolved | Open | requester | "Still broken" within 5 days of `resolved_at`: `reopen_count + 1`, `reopened` event |
| Closed, Cancelled | (none) | | final: read-only, no comments |

## Shapes

### Ticket

Returned by every ticket endpoint (`TicketResponse = { ticket }`, `TicketListResponse = { tickets, pagination }`).

```jsonc
{
  "ticket_id": 1048,
  "title": "VPN drops every 10 minutes on home fibre",
  "description": "Since Monday my VPN ...",
  "ticket_department_id": 1,      "department_name": "IT Support",
  "ticket_category_id": 2,        "category_name": "Network, Wi-Fi & VPN",
  "category_icon": "wifi",        "category_kind": "fix",
  "ticket_priority": "High",
  "ticket_status": "Closed",
  "impact": "blocks_me",          // blocks_me | slows_me_down | minor | null
  "extra_fields": {},             // answers keyed by the category's field keys
  "requester_id": "1001", "requester_name": "Lerato Mokoena", "requester_email": "lerato@mzansifreight.co.za",
  "assignee_id": "1002",  "assignee_name": "Thabo Nkosi",     "assignee_email": "thabo@mzansifreight.co.za",
  "created_at": "2026-11-10T06:14:00.000Z",
  "updated_at": "2026-11-10T12:30:00.000Z",
  "resolved_at": "2026-11-10T11:55:00.000Z",
  "closed_at": "2026-11-10T12:30:00.000Z",
  "reopen_count": 0,
  "resolution_note": "Router firmware updated, TCP profile set as default.",
  "first_response_due_at": "2026-11-10T07:14:00.000Z",   // null while Pending approval
  "resolution_due_at": "2026-11-10T14:14:00.000Z",        // null while Pending approval
  "first_response_at": "2026-11-10T07:02:00.000Z",
  "sla_state": "met"              // met | breached | due_soon | on_track (services/sla.ts slaState)
}
```

`GET /api/tickets/:id` also returns `comments` (public only for the requester) and `feedback`.
`pagination` is `{ page, limit, total, totalPages }`.

### User

```jsonc
{ "user_id": "1002", "name": "Thabo", "surname": "Nkosi", "email": "thabo@mzansifreight.co.za",
  "role": "Agent", "active": true, "department_id": 1, "department_name": "IT Support",
  "led_department_id": null, "must_change_password": false, "last_login_at": null,
  "created_at": "2026-11-13T08:00:00.000Z" }
```

### Category

```jsonc
{ "category_id": 7, "category_name": "Software purchase", "department_id": 1, "department_name": "IT Support",
  "kind": "request", "icon": "credit-card", "description": "A new licence or subscription",
  "default_priority": "Normal", "needs_approval": true, "active": false,
  "fields": [
    { "key": "software_name", "label": "Software name", "type": "text", "required": true },
    { "key": "cost_per_year", "label": "Estimated cost per year", "type": "number", "required": true, "unit": "ZAR" },
    { "key": "reason", "label": "Why do you need it?", "type": "long_text", "required": true },
    { "key": "needed_by", "label": "Needed by", "type": "date", "required": false }
  ],
  "created_at": "...", "updated_at": "..." }
```

Field `type` is `text | number | long_text | date`; optional `help` (text under the input) and `unit` (shown in the input).

---

## S1 Department workspaces & privacy (page 10)

| Verb | Path | Status | Client |
| --- | --- | --- | --- |
| GET | `/api/tickets` | ready (scope); params below | `listTickets` |
| GET | `/api/tickets/:id` | ready | `getTicket` |
| GET | `/api/users` | ready | `listUsers` |
| POST | `/api/users` | ready | `createUser` |
| PATCH | `/api/users/:id` | ready | `updateUser` |
| PATCH | `/api/users/:id/active` | ready | `setUserActive` |
| PUT | `/api/departments/:id/lead` | ready | `appointLead` |
| GET | `/api/departments` | ready | `listDepartments` |
| POST | `/api/auth/change-password` | ready | `changePassword` |
| PUT | `/api/users/update` | ready (your own name and surname only) | `updateOwnName` |
| POST `/api/users/create`, GET `/api/users/getUser`, PUT `/api/users/update/:id`, PUT `/api/users/:id` | | legacy aliases | |

**PUT /api/users/update** - any signed-in user, their own profile. Body `{ name?, surname? }`.
Response `{ user }`. A `password` (use `POST /api/auth/change-password`) or `email` (managed by
your admin) is **400**. With someone else's id the admin rules of `PATCH /api/users/:id` apply.

**GET /api/tickets** - Employee, Agent, Department Lead. System Admin and Platform Admin: **403**.
The WHERE clause comes from the role (`ticketScopeCondition`); a `department_id` sent by an Agent or
Lead is ignored (`?department_id=2` as an IT agent still returns IT tickets only).
Query (all optional): `status` (one value or a comma-separated list), `priority`, `assignee_id`
(user id, `me`, or `none`), `creator_id`, `category_id`, `search` (title, description, requester
name, `HD-1048`), `sort` (`due` | `created` | `updated`, default `created`), `sla` (`breached` | `due_soon`),
`page`, `limit` (1-100, default 10). `department_id` narrows for Employees only.
Errors: 400 unknown status/priority/sort, 403.
Owners: role scope (S1, done); `status` lists and `assignee_id=me|none` (S2); `sort`, `sla` (S3).
Queue views: My open = `assignee_id=me&status=Open,Waiting on employee&sort=due`; Unassigned =
`status=New&sort=due`; Waiting = `assignee_id=me&status=Waiting on employee`; Breached =
`sla=breached&sort=due`; Resolved by me = `assignee_id=me&status=Resolved,Closed&sort=updated`.

**GET /api/tickets/:id** - anyone who `canView`. 404 otherwise (Thabo opening an HR ticket; any
ticket for System/Platform Admin). Response `{ ticket }`. Resolved tickets older than 5 days are
closed on read (S2: `status_changed` event, actor `null`).

**GET /api/users** - System Admin (Employees, Agents, Leads) or Platform Admin (System Admins);
others 403. Query: `role`, `department_id`, `active` (`true`/`false`), `search`.
Response `{ users: User[] }` with `department_name` and `led_department_id`.

**POST /api/users** - System Admin creates Employee / Agent / Department Lead; Platform Admin creates
System Admin. Body `{ name, surname, email, role, department_id, must_change_password? }`.
`department_id` is required for Employee, Agent and Department Lead (**400** "Choose a department"),
must be null for admins. Sends the welcome email with a temporary password and sets
`must_change_password` (default `true`: the "ask them to set a new password" box on page 61).
Response **201** `{ user, welcome_email_sent: boolean, simulated_welcome_email? }`. Without email
settings (local and the free demo; no paid service) or when the send fails, `welcome_email_sent` is
false and the response carries `simulated_welcome_email: { to, temporary_password }` once, which the
Add user drawer shows under a "Simulated email" label. The password is never logged. Errors: 400, 403 (role you may not create),
409 email already used.

**PATCH /api/users/:id** - same admins, same role limits. Body: any of `name, surname, email, role,
department_id` (the department rule above applies to the resulting user). Response `{ user }`.
Errors: 400, 403, 404, 409 email used; 409 when demoting or moving a lead who still leads a
department. Promoting an Agent with `{ role: "Department Lead", department_id }` is how the Appoint
lead dialog (page 62) turns an agent into a lead before `PUT /departments/:id/lead`.

**PATCH /api/users/:id/active** - same admins. Body `{ active: boolean }`. Response `{ user }`.
Deactivated users get **401** on their next request, cookie or not. No hard delete: the
`DELETE /api/users/:id` route goes away. Errors: 400 deactivating yourself, 403, 404.

**PUT /api/departments/:id/lead** - System Admin. Body `{ lead_id }` (`leadId` still accepted).
The user must be an active Department Lead who leads no other department (**409** otherwise; the
`department.lead_id` UNIQUE constraint backs this). Also sets the lead's `users.department_id`, in
the same transaction. Response `{ message, department }` (the full Department shape, with
`departmentLead`). Errors: 400, 403, 404 department or user, 409.

**DELETE /api/departments/:id** (and `PUT /api/departments/:id { status: "inactive" }`) - System
Admin. Deactivates; nothing is deleted. **409** while the department has tickets that aren't Closed
or Cancelled, or active people ("Move them or finish the work before you deactivate it.").
Response `{ message: "Department deactivated.", department }`.

**GET /api/reports/admin-overview** - System Admin, counts only (page 60). `totals` has
`active_users, inactive_users, active_departments, inactive_departments, open_tickets,
breached_tickets`; each `departments[]` row has `lead_name, agents, open_tickets, breached_tickets`.

**POST /api/auth/change-password** - any signed-in user. Body `{ current_password, new_password }`
(password rules as reset). Clears `must_change_password`. Response `{ user }`. Errors: 400 wrong
current password or weak new password, 401 not signed in. `POST /api/auth/login` and `GET /api/auth/me` return
`must_change_password` and stamp `last_login_at` (login); while it is true the app sends the user to
`/change-password` (`ProtectedRoute`, `SignInPage`), and every other authenticated call answers
**403** `{ message, code: "must_change_password", must_change_password: true }` (only `/auth/me`,
`/auth/logout` and `/auth/change-password` work). Wrong current password: "Your current password is
incorrect." Sessions are looked up by the token's user id (an email change signs the person out).

## S2 Ticket lifecycle & ownership (page 11)

| Verb | Path | Status | Client |
| --- | --- | --- | --- |
| POST | `/api/tickets/:id/claim` | ready | `claimTicket` |
| PATCH | `/api/tickets/:id/assign` | ready | `assignTicket` |
| GET | `/api/tickets/agents` | ready | `listAssignees` |
| POST | `/api/tickets/:id/transition` | ready | `transitionTicket` |
| GET | `/api/tickets/:id/actions` | ready | `getTicketActions` |
| POST | `/api/tickets/:id/feedback` | ready | `submitFeedback` |
| PATCH `/api/tickets/:id/status`, `/approve`, `/reject` | | legacy (same rules as `/transition`; approve/reject belong to S6) | |

**POST /api/tickets/:id/claim** - Agent or Lead of the ticket's department. No body. Locks the row
(`FOR UPDATE`), requires `New` and no assignee, sets `assignee_id = me` and `Open` in one transaction,
logs `claimed` (to = my id) and `status_changed` New -> Open. Response `{ ticket }`.
Errors: 404 can't view; 403 can view but not staff of the department (e.g. the requester);
409 not New ("This ticket is Closed, so it can't be claimed.") or already claimed ("Sipho claimed
this a moment ago", "You already own this ticket.").

**PATCH /api/tickets/:id/assign** - the department's lead. Body `{ assignee_id, note? }`. The assignee
must be an active Agent or Lead of the department (400 otherwise). Allowed while New, Open or
Waiting on employee (409 otherwise). New -> Open in the same transaction. Logs `assigned`
(from = old assignee id, to = new id, note) and `status_changed` when New. An Agent may still call
it with their own id (same as `/claim`, kept for older screens); any other assignee is 403.
Response `{ ticket }`.

**POST /api/tickets/:id/transition** - Body `{ to, note? }`. Uses `checkTransition` (status and
message come from it). `note` is required for `to = Resolved` (stored as `resolution_note`).
Side effects: Resolved stamps `resolved_at`; Closed stamps `closed_at`; Resolved -> Open increments
`reopen_count` and logs `reopened` (plus `status_changed`). New -> Open is refused (409, "Claim or
assign it"); Pending approval moves wait for S6. Logs `status_changed` (from, to, note).
Response `{ ticket }`. Errors: 400 unknown status / missing note, 403 wrong person, 404, 409 not an arrow
(New -> Closed: "A ticket can't move from New to Closed."), 5-day window passed, final status.

**GET /api/tickets/:id/actions** - anyone who can view. Response:

```jsonc
{ "actions": ["reply", "wait", "resolve", "change_priority", "internal_note", "assign"],
  "transitions": ["Waiting on employee", "Resolved"],
  "reopen_until": null }        // Resolved: resolved_at + 5 days, when "Still broken" disappears
```

`actions` values: `claim`, `assign`, `change_priority`, `reply`, `internal_note`, `wait`, `resume`,
`resolve`, `confirm_fixed`, `still_broken`, `cancel`, `approve`, `reject` (see `TicketAction` in
`types/api.ts` for when each appears). The UI renders buttons from this list only.

**GET /api/tickets/agents** - Agent or Lead. The people a ticket can be assigned to: active Agents and
Leads of the caller's department. Response `{ agents: Assignee[] }` (`user_id, name, surname, email,
role, department_id, department_name`). Others 403. The lead's Assign menu adds each person's open
load from `GET /api/tickets?status=Open,Waiting on employee`.

**POST /api/tickets/:id/feedback** - the requester, once the ticket is Resolved or Closed. Body
`{ rating: 1-5, comment? }`. Response **201** `{ feedback }`; `GET /api/tickets/:id` returns it as
`ticket.feedback`. Sending it again replaces the rating and keeps the earlier comment unless a new
one is sent. Logs `feedback_given` (from = previous rating or null, to = rating, note = comment). Errors: 400 (not finished, bad rating),
403 not the requester, 404. The CSAT reports on top of it are S10 (Sprint 2).

## S3 Priority triage & SLA timers (page 12)

| Verb | Path | Status | Client |
| --- | --- | --- | --- |
| PATCH | `/api/tickets/:id/priority` | ready | `changePriority` |
| GET | `/api/tickets?sort=due&sla=breached` | ready | `listTickets` |
| GET | `/api/sla-policies` | ready | `listSlaPolicies` |
| PUT | `/api/sla-policies/:priority` | ready | `updateSlaPolicy` |

Every new ticket gets `first_response_due_at` and `resolution_due_at` = `created_at` + the policy
(ready in `POST /api/tickets`). Pending approval tickets have none until approved (clock starts then).

**PATCH /api/tickets/:id/priority** - Agent or Lead of the department while nobody owns the ticket
(New, Pending approval); once owned (Open, Waiting on employee) only the owner or the department's
lead (page 4: "only the owner (or the lead) may change an Open ticket"). Body `{ priority }`.
Recomputes both due times **from `created_at`** with the current policies (`computeDueTimes`), logs
`priority_changed` (from, to). Response `{ ticket }`. Errors: 400 unknown priority, 403 not department
staff or not the owner/lead, 404, 409 Closed/Cancelled. An employee sending `priority` to
`POST /api/tickets` is ignored, and so is staff `priority` for another department's category.

**GET /api/tickets?sort=due** orders by `SQL_NEXT_DUE ASC NULLS LAST` (breached first, then nearest
due); **`sla=breached`** filters with `SQL_IS_BREACHED`, `sla=due_soon` = running and under 25% left.
Without a `status` list both `sla` filters mean the live statuses (New, Open, Waiting on employee),
so a ticket closed late long ago never shows as overdue; send `status` to widen it.

**GET /api/sla-policies** - everyone signed in. Response
`{ "policies": [{ "priority": "Urgent", "first_response_mins": 30, "resolution_mins": 240, "updated_at": "..." }, ...] }`
ordered Urgent, High, Normal, Low.

**PUT /api/sla-policies/:priority** - System Admin (others 403). Body
`{ first_response_mins, resolution_mins }`, positive integers, resolution >= first response (400).
Affects new tickets and later priority changes only; existing due times are not rewritten.
Response `{ policy }`. Errors: 400, 403, 404 unknown priority.

The first **public** reply by department staff stamps `first_response_at` (an internal note does not):
done in `POST /api/tickets/:id/comments` (S4 owns that handler).

## S4 Conversation & activity timeline (page 13)

| Verb | Path | Status | Client |
| --- | --- | --- | --- |
| GET | `/api/tickets/:id/timeline` | ready | `getTimeline` |
| POST | `/api/tickets/:id/comments` | ready | `addComment` |
| PATCH | `/api/comments/:id` | ready | `editComment` |
| DELETE | `/api/comments/:id` | ready (soft delete) | `deleteComment` |

**GET /api/tickets/:id/timeline** - anyone who can view (404 otherwise). One merged list, oldest
first. Employees (anyone who can't `canWork`) never receive internal comments or `is_internal`
events. Response `{ items: TimelineItem[] }`:

```jsonc
{ "kind": "event", "id": "e-12", "at": "...", "type": "status_changed",
  "actor": { "user_id": "1002", "name": "Thabo Nkosi", "role": "Agent", "department_name": "IT Support" },
  "from_value": "Open", "to_value": "Waiting on employee", "from_label": "Open", "to_label": "Waiting on employee",
  "note": null, "is_internal": false }
{ "kind": "comment", "id": "c-3", "at": "...", "comment_id": 3, "actor": { ... },
  "body": "Hi Lerato ...", "is_internal": false, "edited_at": null, "deleted_at": null, "can_edit": false }
```

`actor` is `null` for system events. For `claimed` / `assigned` the values are user ids and the
labels are names. A deleted comment keeps its place with `body: null` ("Message removed by Thabo").
`reopened` stores the old and new `reopen_count` (`"0"` -> `"1"`) with the requester's note, next to
a `status_changed` Resolved -> Open. `comment_deleted` stores the comment id in `to_value` and copies
the comment's `is_internal`. The automatic close has actor `null`, note "Closed automatically 5 days
after it was resolved." and `at` = `resolved_at` + 5 days.

**POST /api/tickets/:id/comments** - requester or department staff. Body `{ body, is_internal? }`
(1-5000 chars). Internal notes: staff only (403). Response **201** `{ comment }`.
Side effects in the same transaction: first public staff reply stamps `first_response_at` (S3);
the requester's reply on a `Waiting on employee` ticket moves it to `Open` with a `status_changed`
event (S2). Stop writing `internal_note` (done). Errors: 400 empty/too long, 403, 404,
**409 Closed or Cancelled** ("This ticket is closed. Start a new request.").

**PATCH /api/comments/:id** - the author, within 15 minutes. Body `{ body }`. Sets `edited_at` and
logs `comment_edited` (to = comment id, `is_internal` = the comment's; the UI shows the "edited"
marker on the message instead of a separate line).
Response `{ comment }`. Errors: 400, 403 not author / window passed, 404 (also for an internal note
the caller can't see), 409 deleted.

**DELETE /api/comments/:id** - the author, within 15 minutes. Soft delete: sets `deleted_at`, the
row stays, logs `comment_deleted` (`is_internal` = the comment's). Response `{ comment }` with
`body: null`. Errors: 403, 404, 409 already deleted.

## S5 Guided requests with category routing (page 14)

| Verb | Path | Status | Client |
| --- | --- | --- | --- |
| GET | `/api/categories` | ready | `listCategories` |
| POST | `/api/tickets` | ready (`Backend/src/services/ticketCreate.ts`) | `createTicket` |
| POST | `/api/categories` | ready | `createCategory` |
| PATCH | `/api/categories/:id` | ready | `updateCategory` |

**GET /api/categories** - everyone signed in: active categories of active departments, sorted by
department, kind, name. System Admin may add `?include_inactive=true`. Response
`{ categories: Category[], departments: [{ department_id, department_name, categories }] }`.

**POST /api/tickets** - Employee, Agent, Lead (admins 403). Body
`{ category_id, title, description, impact?, extra_fields? }`. The server derives
`ticket_department_id` from the category, priority = `default_priority` (Agents and Leads may send
`priority` for their own department's categories only, page 12),
status = `Pending approval` if `needs_approval` else `New`; it sets both due times and logs `created`
in one transaction. Anything else the browser sends (department, status, `requester_id`) is ignored:
nobody raises a ticket for someone else in Sprint 1.
Response **201** `{ message, reference: "HD-1054", ticket }` (the confirmation shows the reference and
`first_response_due_at`).
Errors: 400 missing/unknown/inactive category, title 1-255 chars, bad impact, and required extra
fields: `{ "message": "Validation failed", "errors": [...], "field_errors": { "software_name": "Software name is required." } }`.
`category_id` is required: the department-only bridge and the `POST /api/tickets/create` alias are
gone. There is no free edit or delete of a ticket (`PUT /api/tickets/update/:id` and
`DELETE /api/tickets/:id` were removed): the requester withdraws with `POST /:id/transition
{ to: "Cancelled" }`, and moving a ticket to another department is a lead action in Sprint 2.

**POST /api/categories** - System Admin. Body `{ category_name, department_id, kind, icon,
description?, default_priority, needs_approval, fields, active? }`. Response **201** `{ category }`.
Errors: 400 validation (field keys snake_case and unique), 403, 404 department, 409 name already
used in that department.

**PATCH /api/categories/:id** - System Admin. Any subset of the create body. Deactivate with
`{ active: false }`; there is no delete, old tickets keep their category. Response `{ category }`.
Errors: 400, 403, 404, 409.

Seeded approval categories (New hardware, Software purchase, Access to a system or folder) are
**inactive** until S6 adds the approval step in Sprint 2.

## Screens and routes (Frontend/src/routes/AppRouter.tsx)

| Route | Page | Feature |
| --- | --- | --- |
| `/change-password` | `pages/Auth pages/ChangePasswordFirstLogin.tsx` (forced while `must_change_password`) | S1 |
| `/system-admin` | `pages/system admin/AdminOverview.tsx` (counts + set-up checklist) | S1 |
| `/system-admin/users`, `/platform-admin/users` | `pages/users/Users.tsx` (UserSheet, deactivate/reactivate) | S1 |
| `/system-admin/departments` | `pages/system admin/Departments.tsx` (AppointLeadDialog) | S1 |
| `/agent` | `pages/agent/Dashboard.tsx` (KPIs, due soonest, next in queue) | S2, S3 |
| `/agent/queue/:view` (`my-open`, `unassigned`, `waiting`, `breached`, `resolved`) | `pages/agent/TicketQueue.tsx` | S2, S3 |
| `/agent/tickets/:id`, `/department-lead/tickets/:id` | `pages/tickets/TicketDetails.tsx` -> `components/tickets/StaffTicketView.tsx` (three panes) | S2, S3, S4 |
| `/department-lead` | redirects to All tickets (the Sprint 1 lead home) | S2 |
| `/department-lead/all-tickets` | `pages/department lead/AllTickets.tsx` (Breached tab first) | S2, S3 |
| `/department-lead/dashboard` | `pages/department lead/LeadDashboard.tsx` (until S8) | S8 |
| `/employee`, `/employee/my-requests` | `pages/employee/EmployeeDashboard.tsx` | S2 |
| `/employee/submit-request` | `pages/employee/EmployeeSubmitRequest.tsx` (step 1, category tiles) | S5 |
| `/employee/submit-request/:categoryId` | `pages/employee/NewRequestDetails.tsx` (step 2, extra fields) | S5 |
| `/employee/tickets/:id/submitted` | `pages/employee/RequestSubmitted.tsx` (step 3) | S5 |
| `/employee/tickets/:id` | `pages/employee/RequestDetail.tsx` (public timeline, actions, rating) | S2, S4 |
| `/system-admin/categories` | `pages/system admin/Categories.tsx` (CategorySheet) | S5 |
| `/system-admin/sla` | `pages/system admin/SlaPolicies.tsx` | S3 |

Old addresses (`/agent/ticket-queue`, `/agent/assigned-tickets`, `/agent/resolved-tickets`,
`/department-lead/ticket-queue`) redirect to the new ones.

## Demo data (Backend/scripts/seed.ts, `pnpm db:reset`)

Password `Demo2026!` for every `@mzansifreight.co.za` login. `karabo@` (HR agent) is seeded as
invited (`must_change_password`, never signed in), so the Users table shows "Invited" and signing in
opens `/change-password`. 16 categories (13 active), 27 tickets
on every status and priority. Due times come from `sla_policy` relative to seed time: the IT
Unassigned queue has exactly one breached ticket (HD-1050) and one due soon (HD-1044); Thabo's
HD-1041 is breached. HD-1048 replays page 5 (Tue 10 Nov, first response met in 48 min, resolved in
5 h 41 min, closed, 5 stars) with its full event history. The highest seeded id is 1053, so the
first request made in the demo is **HD-1054**.

### Running the page 28 demo

- Run `pnpm db:reset` right before the demo and don't sign in as `karabo@` beforehand (signing in
  stamps `last_login_at`, so the Users table no longer shows Karabo as Invited).
- **Step 1:** `thabo@` (Thabo Nkosi, IT agent) is a seeded demo login that steps 3-7 need, so
  creating "Thabo Nkosi" with `thabo@` returns 409 and another email would leave two IT agents with
  the same name. Ruan creates a new agent with another name instead, e.g. **Lwazi Dube**,
  `lwazi@mzansifreight.co.za`, Agent, IT Support. With no SMTP configured the drawer shows the
  simulated welcome email with the temporary password; Lwazi can sign in, set a password and claim
  an IT ticket within a minute. Thabo then carries on from step 3 with his seeded login.
- **Step 4:** Thabo sets High while the ticket is still New (anyone in IT may triage it); once he
  has claimed it, only he or Thandi can change the priority.
