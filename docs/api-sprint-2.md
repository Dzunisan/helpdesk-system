# Sprint 2 API contract (S6, S7, S8, S9, S10, S12, S14)

The one agreement between the backend and the frontend for Sprint 2 (briefing pages 15-21, plan p.29,
final demo p.30). It extends [api-sprint-1.md](api-sprint-1.md): the conventions there (base URL,
cookie auth, ids, UTC times shown in SAST, the error body, 400/401/403/404/409 meanings,
"404 Ticket not found." for anyone outside the department) all still apply.

Frontend work calls these endpoints only through `Frontend/src/services/{approvals,macros,reports,
notifications,feedback,attachments,admin}.ts` (plus `tickets.ts` for comments), whose types live at the
end of `Frontend/src/types/api.ts`. If you change a shape, change this file, `types/api.ts` and the
server together.

**Status column:** `ready` = built and tested on `feature/briefing`; `stub` = the route is wired and
answers `501 { message: "Not implemented yet (S7 ...)" }` until its owner replaces the handler.

| Code | Meaning in Sprint 2 |
| --- | --- |
| 413 | An upload over 5 MB: `{ "message": "Too large (max 5 MB)" }` (S14) |
| 501 | A wired route whose feature isn't built yet (stubs below) |

## Data model (`Backend/db/migrations/003_sprint2.sql`)

| Table / column | Feature | Notes |
| --- | --- | --- |
| `ticket_approval (approval_id, ticket_id, approver_id, decision, reason, decided_at)` | S6 | One row **per decision**. Pending requests are tickets in `Pending approval` (no row yet). `decision` is `approved` or `rejected`; a rejection must have a reason (CHECK). |
| `category.needs_approval` / `active` | S6 | Approval categories (New hardware, Software purchase, Access to a system or folder) are **active** now. |
| `canned_response (id, department_id, title, body, set_status, is_internal, created_by, updated_by, use_count, active, created_at, updated_at)` | S7 | UNIQUE `(department_id, title)`. Never deleted: `active = false`. `set_status` is a `ticket_status` or NULL (reply only). |
| `notification (notification_id, user_id, ticket_id, actor_id, type, title, body, read_at, created_at)` | S9 | Index `(user_id, read_at)` and `(user_id, created_at DESC)`. `actor_id` NULL = the system. |
| `notification_pref (user_id, type, email)` | S9 | PK `(user_id, type)`. **No row = email on.** In-app is always on. |
| `outbox (id, channel, recipient, user_id, notification_id, ticket_id, subject, body, status, error, attempts, created_at, sent_at)` | S9 | `channel` email/sms/whatsapp/push; `status` `QUEUED`, `SENT`, `FAILED`, `SIMULATED`. `body` is HTML with every value escaped. |
| `ticket.breach_notified_at` | S9 | Set when the one `sla_breached` alert went out. |
| `ticket_feedback.tags text[]`, `agent_id`, `department_id` | S10 | UNIQUE(ticket_id) (already there). The agent and department **at closing time**. The code must stop upserting (no `ON CONFLICT DO UPDATE`): a second rating is 409. |
| `ticket.csat_requested_at` | S10 | When the "How did we do?" survey was sent (on Closed). |
| `ticket.moved_count int DEFAULT 0` | S12 | +1 per department move. |
| `attachment (attachment_id, ticket_id, comment_id, uploader_id, file_name, mime_type, size_bytes, is_internal, deleted_at, created_at)` | S14 | `comment_id` NULL until sent with a comment. `size_bytes` <= 5 242 880 (CHECK). |
| `attachment_blob (attachment_id PK/FK, data bytea, thumb bytea)` | S14 | The bytes live in Postgres, never on disk or paid storage. |
| `ticket_event.type` + `department_changed`, `attached` | S12, S14 | `department_changed`: from/to = department **names**. `attached`: to = attachment id, note = file name, is_internal = the file's. |

Notification types (DB CHECK, `NotificationType` in both apps): `reply_added`, `assigned`,
`status_changed`, `approval_waiting`, `approval_decided`, `sla_breached`, `low_csat`,
`csat_requested`, `department_changed`.

## Server building blocks (Sprint 2: use these, don't duplicate them)

| File | What |
| --- | --- |
| `Backend/src/services/notify.ts` | `notify(client, { userIds, ticketId, actorId, type, title, body?, path? })`: in the **same transaction** as the change and its `logEvent`, writes one `notification` per recipient and, when their `notification_pref` says email is on, one QUEUED `outbox` email (HTML-escaped). Drops null ids, duplicates, inactive users and **the actor**. Also `departmentLeadId(client, deptId)`, `requestCsat(client, ticketId)`, `ticketRef(id)`, `ticketPathFor(role, id)`, `NOTIFICATION_TYPE_LABELS`. |
| `Backend/src/services/outbox.ts` | `sendPending({ retryFailed? })` delivers QUEUED rows **after commit** through `utils/smtp.ts` (`getTransport`, `fromAddress`): `SENT` or `FAILED` (+ `error`). When `isEmailConfigured()` is false, and for every non-email channel: `SIMULATED`, never sent. `sendPendingSoon()` = fire and forget; call it right after `withTransaction` returns. |
| `Backend/src/services/jobs.ts` | `runJobs()` -> `{ closed, breach_alerts, emails, ran_at }`: 5-day auto-close (+ CSAT survey), one breach alert per ticket (lead + owner, stamps `breach_notified_at`, SKIP LOCKED), then `sendPending({ retryFailed: true })`. `runJobsSoon()`: throttled (once a minute), fire and forget; already called by `GET /api/tickets`; **the S8 report endpoints call it too**. |
| `Backend/src/services/ticketLifecycle.ts` | `transitionInTransaction(client, ticketId, user, to, note, { notifyStatus? })` = the S2 transition on the caller's transaction (used by `set_status`). `closeExpiredResolved()` now sends the CSAT survey for each ticket it closes. |
| `Backend/src/services/extensions/commentMacro.ts` | **EXTENSION POINT (S7 owner):** `applyMacro(ctx, macroId)`, called by `addComment` before the comment is written. |
| `Backend/src/services/extensions/commentAttachments.ts` | **EXTENSION POINT (S14 owner):** `linkAttachments(ctx, commentId, ids)` (after the comment is written) and `loadCommentAttachments(commentIds, includeInternal)` (timeline). |
| `Backend/src/services/extensions/commentContext.ts` | The `CommentContext` both receive: `{ client, user, access, ticket, staff, requester, isInternal }`. |

### Notifications already wired (S9 recipients, p.18; never the actor)

| Where | Type | Who hears it |
| --- | --- | --- |
| Claim (`POST /claim`, agent self-assign) | `status_changed` "Thabo Nkosi is working on HD-1054" | requester |
| Lead assigns (`PATCH /assign`) | `assigned` "Thandi Mthembu assigned HD-1045 to you" | new owner (+ requester `status_changed` when New -> Open) |
| `POST /transition` | `status_changed` | requester and owner |
| Public staff reply | `reply_added` "Thabo Nkosi replied on HD-1048" | requester |
| Requester's reply | `reply_added` | owner |
| Internal note | `reply_added` "... added an internal note ..." | owner only. **Never the employee.** |
| New request in an approval category | `approval_waiting` | the department's lead |
| Approve / reject | `approval_decided` (body = note / reason) | requester |
| Ticket Closed (confirmed or 5-day auto-close) | `csat_requested` "How did we do on HD-1048?" (path `/employee/tickets/:id/feedback`) | requester |
| `runJobs` breach alert | `sla_breached` "First response breached on HD-1050" | department lead + owner, once per ticket |
| To wire by their owners | `low_csat` (S10: rating 1-2 -> lead), `department_changed` (S12: requester + new department's lead) | |

The old direct ticket emails (`sendTicketAssignedEmail`, `sendTicketCommentEmail`,
`sendTicketStatusEmail`) are gone: every ticket email is an outbox row now. Welcome and
password-reset emails still go straight through `utils/smtp.ts`.

## Comments with Sprint 2 extras (ready)

`POST /api/tickets/:id/comments` — requester or department staff (Sprint 1 rules unchanged).

```json
{ "body": "Hi Lerato, ...", "is_internal": false,
  "attachment_ids": [12, 13], "macro_id": 1, "set_status": "Waiting on employee" }
```

| Field | Rule |
| --- | --- |
| `attachment_ids` | Optional, at most 5. Each must be the caller's own **unsent** upload on this ticket (`POST /tickets/:id/attachments`), else 400 "One of the files can't be attached. Upload it again." The files take the comment's `is_internal`. |
| `macro_id` | Optional. Staff of the ticket's department only (403). The macro must be active and in the ticket's department, else 404 "Macro not found." (IT agents never use HR macros). `use_count + 1`. The **body is what the agent sends** (render first, edit, then send). |
| `set_status` | Optional. Omitted = the macro's `set_status` (if any); `null` = reply only; a status = that move. Staff only (403 for the requester). Applied with the normal arrows **only when allowed for this person**; otherwise the reply is still saved and the response says why. `Resolved` uses the reply as the resolution note. A public reply with `set_status` sends one `reply_added`, not a second `status_changed`. |

Response `201`:

```json
{ "message": "Reply sent.",
  "comment": { "comment_id": 46, "ticket_id": 1045, "body": "...", "is_internal": false, "macro_id": 1, "...": "Comment shape" },
  "set_status": { "requested": "Waiting on employee", "applied": true, "message": null } }
```

`set_status` is `null` when none was asked for; `{ "applied": false, "message": "A ticket can't move from Waiting on employee to Resolved." }` when refused. Client: `tickets.sendComment(id, body)`.

`GET /api/tickets/:id/timeline` comment items now carry `attachments: AttachmentSummary[]` (internal
files only for staff; `[]` for a deleted comment).

---

## S6 Approvals with a visible reason (p.15, p.56) — owner: approvals

| Status | Method | Path | Who | Body / query | Response |
| --- | --- | --- | --- | --- | --- |
| stub | GET | `/api/approvals?status=pending` | Department Lead (403 others) | `page`, `limit` | `200 { approvals: ApprovalItem[], pagination }`. Own led department(s) only, oldest first. |
| stub | GET | `/api/approvals?decided_by=me` | Department Lead | `page`, `limit` | `200 { approvals, pagination }`: the History tab, newest decision first, from `ticket_approval`. |
| stub | GET | `/api/approvals/count` | Department Lead | | `200 { pending }` for the sidebar "Approvals (3)" |
| ready | POST | `/api/tickets/:id/approve` | the ticket department's lead | `{ note? }` | `200 { message, ticket }`. -> `New` (or `Open` if owned), SLA clocks start **now**, `approved` public event, `ticket_approval` row, `approval_decided` to the requester. 404 other department (e.g. Finance lead on an IT ticket), 403 an agent, 409 not Pending approval. |
| ready | POST | `/api/tickets/:id/reject` | the ticket department's lead | `{ reason }` | `200 { message, ticket }`. -> `Cancelled`, `rejected` public event with the reason, `ticket_approval` row, `approval_decided`. **400 without a reason.** 404/403/409 as approve. |

`ApprovalItem`: `{ ticket: Ticket, decision: "approved"|"rejected"|null, reason, decided_at, approver_id, approver_name, waiting_mins }`.
A Pending approval ticket is never in the agent queues (Sprint 1 already filters by status) and has
no due times until approved. The employee request page shows the decision and reason from the
public `approved` / `rejected` event (timeline) and `ticket.ticket_status`.

## S7 Canned responses / macros (p.16, p.58) — owner: macros

| Status | Method | Path | Who | Body / query | Response |
| --- | --- | --- | --- | --- | --- |
| stub | GET | `/api/macros?q=vpn` | Agent, Lead (403 others) | `q` (title/body search), `include_inactive=true` (lead only) | `200 { macros: Macro[] }`: own department(s) only, most used first |
| stub | GET | `/api/macros/:id/render?ticket=1048` | Agent, Lead of the macro's **and** the ticket's department | | `200 RenderedMacro { macro_id, ticket_id, body, set_status, is_internal }` with `{{requester.first_name}}`, `{{ticket.ref}}`, `{{ticket.title}}`, `{{agent.first_name}}` filled. 404 macro or ticket not visible. |
| stub | POST | `/api/macros` | Department Lead (department = the one they lead) | `{ title, body, set_status?, is_internal? }` | `201 { macro }`. 400 empty title/body, unknown status; 409 same title in the department. |
| stub | PATCH | `/api/macros/:id` | that department's lead | any of `{ title, body, set_status, is_internal, active }` | `200 { macro }`. 404 another department's macro. |
| ready | POST | `/api/tickets/:id/comments` | staff | `{ body, macro_id, set_status }` | see "Comments with Sprint 2 extras" |

`Macro`: `{ id, department_id, department_name, title, body, set_status, is_internal, use_count, active, created_by, updated_by, updated_by_name, created_at, updated_at }`.

## S8 Lead dashboard & workload (p.17, p.54, p.57, p.60) — owner: dashboard

All: Department Lead (department **forced** to their own; `?department_id=` ignored, so the IT lead
never sees HR numbers) or System Admin (`?department_id=` optional, aggregates only, never ticket
content). Others 403. Each calls `runJobsSoon()`. Empty departments answer zeros / `null`, never NaN.

| Status | Method | Path | Query | Response |
| --- | --- | --- | --- | --- |
| stub | GET | `/api/reports/summary` | `department_id?`, `days=30` | `200 ReportSummary`: backlog, unassigned (+ oldest age), breached (first response / resolution), avg first response + % within target, avg resolution + % within SLA, reopen rate, CSAT % + responses, pending approvals (+ oldest) |
| stub | GET | `/api/reports/workload` | `department_id?`, `days=30` | `200 { agents: WorkloadRow[] }`: per agent open, waiting, breached, resolved_7d, csat_pct |
| stub | GET | `/api/reports/breaches` | `department_id?` | `200 { tickets: Ticket[] }`: top 10 breached then due soon, nearest due first. **System Admin: 403** (ticket content). |
| stub | GET | `/api/reports/daily?days=14` | `department_id?`, `days` (1-90) | `200 { days: [{ date: "2026-11-10", created, resolved }] }` (SAST days, every day present) |
| ready | GET | `/api/reports/admin-overview` | | Sprint 1, unchanged (System Admin) |

Definitions (p.17): backlog = `New`, `Open`, `Waiting on employee`; breached = `SQL_IS_BREACHED` on
live tickets; avg first response = `AVG(first_response_at - created_at)` over tickets created in the
window; avg resolution = `AVG(resolved_at - created_at)`; reopen rate = resolved in window with
`reopen_count > 0`; CSAT = ratings 4-5 / all ratings in the window (`ticket_feedback.department_id`).

## S9 In-app notifications, outbox, jobs (p.18, p.51, p.68) — owner: notifications

| Status | Method | Path | Who | Body / query | Response |
| --- | --- | --- | --- | --- | --- |
| stub | GET | `/api/notifications?unread=1&limit=30` | everyone | `unread`, `limit` (max 100) | `200 { notifications: AppNotification[], unread }` own only, newest first |
| stub | GET | `/api/notifications/count` | everyone | | `200 { unread }` (bell polls every 30 s) |
| stub | PATCH | `/api/notifications/:id/read` | the notification's user (404 anyone else) | | `200 { notification }` |
| stub | POST | `/api/notifications/read-all` | everyone | | `200 { updated }` |
| stub | GET | `/api/me/notification-prefs` | everyone | | `200 { prefs: [{ type, label, email }] }` one per type relevant to the role |
| stub | PUT | `/api/me/notification-prefs` | everyone | `{ prefs: [{ type, email }] }` | `200 { prefs }`. 400 unknown type. Turning email off keeps the in-app item. |
| stub | GET | `/api/admin/outbox` | System Admin | `status`, `channel`, `date` (YYYY-MM-DD SAST), `page`, `limit` | `200 { messages: OutboxMessage[], pagination, counts }` (no HTML body) |
| ready | POST | `/api/admin/jobs/run` | System Admin (403 others) | | `200 { message: "Jobs ran.", result: { closed, breach_alerts, emails: { sent, failed, simulated }, ran_at } }`. Running it again adds no second breach alert. |

`AppNotification`: `{ notification_id (string), type, title, body, ticket_id, actor: { user_id, name } | null, read_at, created_at, path }`.
`path` is where clicking goes for that user (`ticketPathFor(role, id)`, or the survey for `csat_requested`).

Frontend slot: `Frontend/src/components/notifications/NotificationBell.tsx` (mounted in the staff
sidebar, the staff phone bar and the portal top bar). Replace its body; keep its name and props.

## S10 CSAT survey (p.19, p.43, p.53) — owner: CSAT

| Status | Method | Path | Who | Body | Response |
| --- | --- | --- | --- | --- | --- |
| ready (Sprint 1 shape) -> to change | GET | `/api/tickets/:id/feedback` | requester, or staff of the department (404 others) | | `200 { feedback: TicketFeedback \| null }` (+ `tags`, `agent_id`, `department_id`) |
| ready (Sprint 1 shape) -> to change | POST | `/api/tickets/:id/feedback` | the requester only (**403** staff, e.g. Thabo on a ticket he worked) | `{ rating 1-5, tags?: CsatTag[], comment? }` | `201 { feedback }`. **409** when already rated ("Thanks, you already rated this") or the ticket isn't Closed. Stores `agent_id` / `department_id` from the ticket now. `feedback_given` event. Rating 1-2 -> `notify` `low_csat` to the department lead. |
| stub | GET | `/api/reports/csat?days=30` | Lead (own department forced), System Admin (`department_id?`) | | `200 CsatReport { responses, csat_pct, avg_rating, distribution[5], by_agent[], recent[] }` |

Tags: `Fast reply`, `Kept me updated`, `Fixed first time`, `Friendly`. The survey is requested when a
ticket closes (`requestCsat`, already wired: employee confirms or the 5-day auto-close).
Route file for the report: `routes/csatRoutes.ts` (mounted on `/api/reports` next to S8's file).

## S12 Move to another department (p.20, p.50) — owner: move department

| Status | Method | Path | Who | Body | Response |
| --- | --- | --- | --- | --- | --- |
| stub | PATCH | `/api/tickets/:id/department` | any agent of the current department, or its lead (404 others) | `{ department_id, category_id, reason, message? }` | `200 { message, ticket }`. One transaction: department + category change, status `New`, assignee cleared, **due times kept**, `moved_count + 1`, a public `department_changed` event ("Moved from IT Support to Facilities", note = the public message) and an internal one (note = the reason), `notify` `department_changed` to the requester and the new department's lead. 400 missing reason / category not in that department / same department; 409 Pending approval or final status. Afterwards the old department gets 404. |
| stub | GET | `/api/departments/:id/categories` | Agent, Lead (403 others) | | `200 { categories: Category[] }` active categories of that active department |

## S14 Attachments (p.21, p.39-42, p.48-49) — owner: attachments

| Status | Method | Path | Who | Body | Response |
| --- | --- | --- | --- | --- | --- |
| stub | POST | `/api/tickets/:id/attachments` | anyone who can comment on the ticket (404 others) | multipart `files` (1-5), optional `is_internal=true` (staff only) | `201 { attachments: AttachmentSummary[] }` (unsent, `comment_id` null) + an `attached` event per file. **413** "Too large (max 5 MB)"; 400 type not allowed (checked from the **first bytes**, so a renamed .exe is refused), more than 5 files, final ticket. |
| stub | GET | `/api/attachments/:id` | `canView` on the ticket; internal files staff only (404 otherwise) | | the bytes, `Content-Type` = stored type, `Content-Disposition: attachment; filename*=` (names are data, never HTML), `X-Content-Type-Options: nosniff` |
| stub | GET | `/api/attachments/:id/thumb` | as above | | small image preview (`thumb` or the image itself) |
| stub | DELETE | `/api/attachments/:id` | the uploader within 15 minutes | | `200 { message }` soft delete (`deleted_at`); 403 someone else / too late |

Allowed types: PNG, JPEG, GIF, WebP, PDF, plain text, CSV, DOCX, XLSX (`ATTACHMENT_ACCEPT`). Upload
with multer **memory storage** into `attachment_blob`. Send the ids with the comment
(`attachment_ids`).

---

## Screens and routes added (Frontend/src/routes/AppRouter.tsx)

| Route | Screen | State |
| --- | --- | --- |
| `/department-lead` (index) | Lead dashboard (S8, p.54). `/department-lead/dashboard` redirects here. | Sprint 1 client-side dashboard until S8 rebuilds it on `/api/reports/*` |
| `/department-lead/macros` | Macros manager (S7, p.58) | placeholder `pages/department lead/MacrosManager.tsx` |
| `/system-admin/outbox` | Sent messages + Run jobs now (S9) | placeholder `pages/system admin/SentMessages.tsx` |
| `/employee/tickets/:id/feedback` | CSAT survey (S10, p.43) | placeholder `pages/employee/CsatSurvey.tsx` |
| bell | `components/notifications/NotificationBell.tsx` (S9, p.51) | slot: today a popover saying updates are emailed |

Nav: lead sidebar Dashboard (index), All tickets, Approvals (count), Team & workload, **Macros**;
System Admin **Sent messages**. New shadcn components: `chart` (Recharts, S8), `scroll-area`
(notification panel). Already present: command, popover, progress, resizable, sheet, toggle-group.

## Demo data (`pnpm db:reset`; p.30 "Seed for the demo")

| What | Where |
| --- | --- |
| Approvals (3) for Thandi | HD-1052 Ayesha's Adobe Acrobat Pro (R3 960/yr), HD-1047 Nomvula's laptop for Sizwe, HD-1040 Pieter's Finance reporting folder access. History: HD-1036 approved, HD-1026 rejected with a reason. |
| Macros | 6 IT (VPN: switch to TCP profile -> Waiting, Sage re-sync, Password reset link, Laptop on order, Resolved: please confirm -> Resolved, Printer jam) and 3 HR, with use counts |
| Misfiled ticket | HD-1037 Zanele "Aircon dripping onto my desk" in IT (move it to Facilities, Bongani's queue) |
| Run jobs now | HD-1050 is just past its first-response time and **not** alerted: one `sla_breached` for Thandi; running again adds nothing. HD-1041 (already breached) was alerted at seed time. |
| CSAT history | HD-1001..HD-1025 closed and rated over the last 30 days (IT about 91%, two 2-star comments last week: HD-1019, HD-1020); HD-1048 and HD-1027 rated 5 |
| Notifications | Lerato: unread "Thabo Nkosi replied on HD-1041"; Thandi: 3 unread approvals waiting; read breach and low-rating items; each with a SIMULATED outbox row. Pieter has email off for status changes. |

The next request made in the demo is still **HD-1054**.

## Testing locally without sending email

Start test servers with `EMAIL_PASS=` (empty): `isEmailConfigured()` is false, so every outbox row
becomes `SIMULATED` and nothing reaches Mailtrap. Never point a test at `helpdesk_dev`; use your own
database with `DB_DATABASE=...`.
