-- 003: Sprint 2 data model (briefing pages 15-21): approvals (S6), macros (S7), notifications +
-- outbox + breach alerts (S9), CSAT (S10), department moves (S12) and attachments (S14).
-- Runs inside one transaction (scripts/migrate.ts), so no BEGIN/COMMIT here. Written to upgrade a
-- database that already holds Sprint 1 data. Never edit it once applied: add 004_... instead.
-- Contract: docs/api-sprint-2.md.

-- ---------------------------------------------------------------------------------------------
-- Timeline: Sprint 2 event types (page 13 list + S12 department_changed + S14 attached)
--   department_changed - S12: from_value / to_value are department NAMES; a public event, plus a
--                        second internal one with the reason in note
--   attached           - S14: to_value = attachment id, note = file name, is_internal = the file's
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ticket_event DROP CONSTRAINT ticket_event_type_check;
ALTER TABLE ticket_event ADD CONSTRAINT ticket_event_type_check CHECK (type IN (
  'created', 'claimed', 'assigned', 'status_changed', 'priority_changed',
  'approved', 'rejected', 'reopened', 'comment_deleted', 'comment_edited', 'feedback_given',
  'department_changed', 'attached'));

-- ---------------------------------------------------------------------------------------------
-- ticket: S9 breach alert stamp, S10 survey stamp, S12 ping-pong counter
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ticket
  -- S9: set when the lead got the one sla_breached notification (runJobs never alerts twice)
  ADD COLUMN breach_notified_at timestamptz,
  -- S10: set when the "How did we do?" survey was sent (on Closed)
  ADD COLUMN csat_requested_at  timestamptz,
  -- S12: how often the ticket moved department (spot ping-pong tickets in reports)
  ADD COLUMN moved_count        integer NOT NULL DEFAULT 0 CHECK (moved_count >= 0);

-- Tickets already closed before Sprint 2 never get a survey
UPDATE ticket SET csat_requested_at = closed_at WHERE ticket_status = 'Closed' AND csat_requested_at IS NULL;

-- runJobs looks for live tickets that are past due and not yet alerted
CREATE INDEX ticket_breach_alert_idx ON ticket (ticket_status) WHERE breach_notified_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- S6: one row per decision. Pending requests are tickets in 'Pending approval' (no row yet);
-- approve / reject insert the row in the same transaction as the status change.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ticket_approval (
  approval_id serial PRIMARY KEY,
  ticket_id   integer NOT NULL REFERENCES ticket (ticket_id),
  approver_id bigint NOT NULL REFERENCES users (user_id),
  decision    text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  -- Approve: optional note. Reject: required reason, shown to the requester.
  reason      text,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'approved' OR (reason IS NOT NULL AND btrim(reason) <> ''))
);
CREATE INDEX ticket_approval_ticket_idx ON ticket_approval (ticket_id);
CREATE INDEX ticket_approval_approver_idx ON ticket_approval (approver_id, decided_at DESC);

-- Decisions made in Sprint 1 (approved / rejected events) become rows, so the History tab isn't empty
INSERT INTO ticket_approval (ticket_id, approver_id, decision, reason, decided_at)
SELECT e.ticket_id, e.actor_id, e.type, COALESCE(e.note, CASE WHEN e.type = 'rejected' THEN 'No reason recorded' END), e.created_at
FROM ticket_event e
WHERE e.type IN ('approved', 'rejected') AND e.actor_id IS NOT NULL;

-- Approval categories were seeded inactive in Sprint 1 ("until S6 switches them on")
UPDATE category SET active = true, updated_at = now() WHERE needs_approval AND NOT active;

-- ---------------------------------------------------------------------------------------------
-- S7: canned responses (macros), one department each. Never deleted: active = false.
-- Placeholders in body: {{requester.first_name}}, {{ticket.ref}}, {{ticket.title}}, {{agent.first_name}}
-- ---------------------------------------------------------------------------------------------
CREATE TABLE canned_response (
  id            serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES department (department_id),
  title         text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
  body          text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 5000),
  -- "Then set status": applied through the normal transition rules; NULL = reply only
  set_status    ticket_status,
  -- true = inserts an internal note instead of a public reply
  is_internal   boolean NOT NULL DEFAULT false,
  created_by    bigint REFERENCES users (user_id),
  updated_by    bigint REFERENCES users (user_id),
  use_count     integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canned_response_department_title_unique UNIQUE (department_id, title)
);
CREATE INDEX canned_response_department_idx ON canned_response (department_id, active);

-- ---------------------------------------------------------------------------------------------
-- S9: in-app notifications, per-type email preferences, and the outbox every email goes through
-- ---------------------------------------------------------------------------------------------
CREATE TABLE notification (
  notification_id bigserial PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users (user_id),       -- who it is for
  ticket_id       integer REFERENCES ticket (ticket_id),
  actor_id        bigint REFERENCES users (user_id),                -- who did it; NULL = the system
  type            text NOT NULL CHECK (type IN (
                    'reply_added', 'assigned', 'status_changed', 'approval_waiting', 'approval_decided',
                    'sla_breached', 'low_csat', 'csat_requested', 'department_changed')),
  title           text NOT NULL CHECK (length(title) <= 300),
  -- Optional second line in the panel, e.g. the first words of a reply (plain text)
  body            text,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_user_read_idx ON notification (user_id, read_at);
CREATE INDEX notification_user_created_idx ON notification (user_id, created_at DESC);

-- No row = email on (the default). In-app is always on.
CREATE TABLE notification_pref (
  user_id bigint NOT NULL REFERENCES users (user_id),
  type    text NOT NULL CHECK (type IN (
            'reply_added', 'assigned', 'status_changed', 'approval_waiting', 'approval_decided',
            'sla_breached', 'low_csat', 'csat_requested', 'department_changed')),
  email   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, type)
);

-- Every message the app would send. Email goes out after commit through utils/smtp.ts (SENT /
-- FAILED, or SIMULATED when SMTP isn't configured); every other channel is only ever SIMULATED.
CREATE TABLE outbox (
  id              bigserial PRIMARY KEY,
  channel         text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'whatsapp', 'push')),
  recipient       text NOT NULL,                                    -- email address (or number for sms)
  user_id         bigint REFERENCES users (user_id),
  notification_id bigint REFERENCES notification (notification_id),
  ticket_id       integer REFERENCES ticket (ticket_id),
  subject         text NOT NULL,
  body            text NOT NULL,                                    -- HTML, every value escaped
  status          text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'SIMULATED')),
  error           text,
  attempts        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX outbox_status_idx ON outbox (status, created_at);
CREATE INDEX outbox_created_idx ON outbox (created_at DESC);

-- ---------------------------------------------------------------------------------------------
-- S10: one rating per ticket (UNIQUE(ticket_id) already exists; the code no longer upserts).
-- The agent and department at closing time are stored with the rating, so a later reassignment
-- or move doesn't move the score.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ticket_feedback
  ADD COLUMN tags          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN agent_id      bigint REFERENCES users (user_id),
  ADD COLUMN department_id integer REFERENCES department (department_id);

UPDATE ticket_feedback f
SET agent_id = t.assignee_id, department_id = t.ticket_department_id
FROM ticket t
WHERE t.ticket_id = f.ticket_id AND f.department_id IS NULL;

CREATE INDEX ticket_feedback_department_created_idx ON ticket_feedback (department_id, created_at DESC);
CREATE INDEX ticket_feedback_agent_idx ON ticket_feedback (agent_id);

-- ---------------------------------------------------------------------------------------------
-- S14: attachments. Bytes live in the database (attachment_blob), never on disk or paid storage.
-- An attachment belongs to a comment once that comment is sent (comment_id NULL until then) and
-- inherits its is_internal. Downloads go through GET /api/attachments/:id (canView).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE attachment (
  attachment_id serial PRIMARY KEY,
  ticket_id     integer NOT NULL REFERENCES ticket (ticket_id),
  comment_id    integer REFERENCES comment (comment_id),
  uploader_id   bigint NOT NULL REFERENCES users (user_id),
  file_name     text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),   -- 5 MB
  is_internal   boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachment_ticket_idx ON attachment (ticket_id, created_at);
CREATE INDEX attachment_comment_idx ON attachment (comment_id);

CREATE TABLE attachment_blob (
  attachment_id integer PRIMARY KEY REFERENCES attachment (attachment_id) ON DELETE CASCADE,
  data          bytea NOT NULL,
  thumb         bytea
);
