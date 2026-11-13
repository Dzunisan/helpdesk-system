-- 001: Sprint 1 data model (briefing pages 10-14): the seven-status lifecycle, Urgent/High/Normal/Low
-- priorities with SLA clocks, the append-only ticket_event history, categories that decide routing
-- (request_type folded in), and the user/department rules from S1.
-- Runs inside one transaction (scripts/migrate.ts), so no BEGIN/COMMIT here. Written to also upgrade a
-- database that already holds data on the 000 values; never edit it once applied: add 002_... instead.

-- ---------------------------------------------------------------------------------------------
-- S2 statuses (page 4, 11). Legacy meanings:
--   'Open' + no assignee  -> 'New'   (in the department queue, nobody owns it)
--   'Open' + assignee     -> 'Open'  (one named agent owns it)
--   'In progress'         -> 'Open'  ('New' when it somehow has no assignee: Open always has an owner)
-- A new enum type, because ALTER TYPE ... ADD VALUE can't be used in the same transaction.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE ticket_status_v2 AS ENUM (
  'Pending approval', 'New', 'Open', 'Waiting on employee', 'Resolved', 'Closed', 'Cancelled'
);

ALTER TABLE ticket ALTER COLUMN ticket_status DROP DEFAULT;
ALTER TABLE ticket
  ALTER COLUMN ticket_status TYPE ticket_status_v2 USING (
    CASE ticket_status::text
      WHEN 'Open'        THEN CASE WHEN assignee_id IS NULL THEN 'New' ELSE 'Open' END
      WHEN 'In progress' THEN CASE WHEN assignee_id IS NULL THEN 'New' ELSE 'Open' END
      ELSE ticket_status::text
    END
  )::ticket_status_v2;
DROP TYPE ticket_status;
ALTER TYPE ticket_status_v2 RENAME TO ticket_status;
ALTER TABLE ticket ALTER COLUMN ticket_status SET DEFAULT 'New';

-- ---------------------------------------------------------------------------------------------
-- S3 priorities (page 12, 31): Urgent, High, Normal, Low. Legacy 'Medium' -> 'Normal'.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE ticket_priority_v2 AS ENUM ('Urgent', 'High', 'Normal', 'Low');

ALTER TABLE ticket ALTER COLUMN ticket_priority DROP DEFAULT;
ALTER TABLE ticket
  ALTER COLUMN ticket_priority TYPE ticket_priority_v2 USING (
    CASE ticket_priority::text WHEN 'Medium' THEN 'Normal' ELSE ticket_priority::text END
  )::ticket_priority_v2;
DROP TYPE ticket_priority;
ALTER TYPE ticket_priority_v2 RENAME TO ticket_priority;
ALTER TABLE ticket ALTER COLUMN ticket_priority SET DEFAULT 'Normal';

-- ---------------------------------------------------------------------------------------------
-- ticket: lifecycle timestamps (S2), SLA clocks (S3), impact + extra fields (S5)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ticket
  -- "How is this affecting you?" (page 39). The employee says how bad it is; staff set priority.
  ADD COLUMN impact                text CHECK (impact IN ('blocks_me', 'slows_me_down', 'minor')),
  ADD COLUMN resolved_at           timestamptz,
  ADD COLUMN closed_at             timestamptz,
  ADD COLUMN reopen_count          integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  ADD COLUMN resolution_note       text,
  ADD COLUMN first_response_due_at timestamptz,
  ADD COLUMN resolution_due_at     timestamptz,
  ADD COLUMN first_response_at     timestamptz,
  -- Answers to the category's extra fields, keyed by field key: {"software_name": "Acrobat", ...}
  ADD COLUMN extra_fields          jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Best guess for tickets that were already finished: the last time they changed
UPDATE ticket SET resolved_at = updated_at WHERE ticket_status IN ('Resolved', 'Closed') AND resolved_at IS NULL;
UPDATE ticket SET closed_at   = updated_at WHERE ticket_status = 'Closed' AND closed_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- S3: one SLA policy per priority (page 12). Minutes, calendar time, no pause in Sprint 1.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE sla_policy (
  priority            ticket_priority PRIMARY KEY,
  first_response_mins integer NOT NULL CHECK (first_response_mins > 0),
  resolution_mins     integer NOT NULL CHECK (resolution_mins > 0),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          bigint REFERENCES users (user_id)
);

INSERT INTO sla_policy (priority, first_response_mins, resolution_mins) VALUES
  ('Urgent',  30,  240),
  ('High',    60,  480),
  ('Normal', 240, 1440),
  ('Low',    480, 4320);

-- Due times are always counted from created_at (page 5: "Changing priority recalculates both from
-- created_at, not from now"). A request waiting in Pending approval has no clock yet: the team can't
-- act on it until the lead approves (S6 sets the due times then).
UPDATE ticket t
SET first_response_due_at = t.created_at + make_interval(mins => p.first_response_mins),
    resolution_due_at     = t.created_at + make_interval(mins => p.resolution_mins)
FROM sla_policy p
WHERE p.priority = t.ticket_priority
  AND t.ticket_status <> 'Pending approval';

-- The first public reply from department staff (not the requester) stops the first-response clock
UPDATE ticket t
SET first_response_at = r.first_at
FROM (
  SELECT c.ticket_id, MIN(c.created_at) AS first_at
  FROM comment c
  JOIN ticket tk ON tk.ticket_id = c.ticket_id
  JOIN users u ON u.user_id = c.author_id
  WHERE NOT c.is_internal
    AND u.role IN ('Agent', 'Department Lead')
    AND c.author_id IS DISTINCT FROM tk.requester_id
  GROUP BY c.ticket_id
) r
WHERE r.ticket_id = t.ticket_id;

-- ---------------------------------------------------------------------------------------------
-- S5: categories decide department, default priority, approval and extra fields (page 14).
-- request_type is folded in: every request type becomes a category, then nothing uses it again.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE category
  ADD COLUMN kind             text NOT NULL DEFAULT 'fix' CHECK (kind IN ('fix', 'request')),
  -- A lucide icon name in kebab case, e.g. 'wifi', 'laptop', 'key-round'
  ADD COLUMN icon             text NOT NULL DEFAULT 'circle-help',
  ADD COLUMN description      text,
  ADD COLUMN default_priority ticket_priority NOT NULL DEFAULT 'Normal',
  ADD COLUMN needs_approval   boolean NOT NULL DEFAULT false,
  -- Extra form fields: [{"key","label","type":"text|number|long_text|date","required",...}]
  ADD COLUMN fields           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
  ADD COLUMN active           boolean NOT NULL DEFAULT true,
  ADD COLUMN created_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at       timestamptz NOT NULL DEFAULT now();

-- Every category routes to a department. Orphans (none in the seed) go to the first department.
UPDATE category SET department_id = (SELECT MIN(department_id) FROM department) WHERE department_id IS NULL;

-- Each request type becomes a category (reusing a same-named category in the same department)
CREATE TEMP TABLE request_type_category (request_type_id integer PRIMARY KEY, category_id integer NOT NULL) ON COMMIT DROP;

INSERT INTO category (department_id, category_name, kind, needs_approval, active, fields)
SELECT COALESCE(rt.department_id, (SELECT MIN(department_id) FROM department)),
       rt.request_type_name,
       CASE WHEN rt.kind = 'provision' THEN 'request' ELSE 'fix' END,
       rt.kind = 'provision',
       -- Approvals arrive with S6 in Sprint 2; until then approval categories stay off the form
       rt.kind <> 'provision',
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
                  'key', btrim(f),
                  'label', upper(left(btrim(f), 1)) || replace(substr(btrim(f), 2), '_', ' '),
                  'type', 'text',
                  'required', true))
         FROM unnest(string_to_array(rt.extra_fields, ',')) AS f
         WHERE btrim(f) <> ''
       ), '[]'::jsonb)
FROM request_type rt
WHERE NOT EXISTS (
  SELECT 1 FROM category c
  WHERE c.category_name = rt.request_type_name
    AND c.department_id IS NOT DISTINCT FROM COALESCE(rt.department_id, (SELECT MIN(department_id) FROM department))
);

INSERT INTO request_type_category (request_type_id, category_id)
SELECT rt.request_type_id, c.category_id
FROM request_type rt
JOIN category c
  ON c.category_name = rt.request_type_name
 AND c.department_id = COALESCE(rt.department_id, (SELECT MIN(department_id) FROM department));

-- Purchase and access requests keep their request-type category (it carries the approval rule);
-- everything else keeps its own category and only borrows the request type's when it had none
UPDATE ticket t
SET ticket_category_id = m.category_id
FROM request_type_category m, request_type rt
WHERE m.request_type_id = t.ticket_request_type_id
  AND rt.request_type_id = t.ticket_request_type_id
  AND (t.ticket_category_id IS NULL OR rt.kind = 'provision');

-- Any ticket still without a category gets its department's "Something else" category
-- (one with neither a category nor a department lands in the first department)
UPDATE ticket SET ticket_department_id = (SELECT MIN(department_id) FROM department)
WHERE ticket_category_id IS NULL AND ticket_department_id IS NULL;

INSERT INTO category (department_id, category_name, kind, icon, description)
SELECT DISTINCT t.ticket_department_id, 'Something else', 'fix', 'circle-help', 'Not sure? The team will route it.'
FROM ticket t
WHERE t.ticket_category_id IS NULL
  AND t.ticket_department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM category c WHERE c.department_id = t.ticket_department_id AND c.category_name = 'Something else'
  );

UPDATE ticket t
SET ticket_category_id = c.category_id
FROM category c
WHERE t.ticket_category_id IS NULL
  AND c.department_id = t.ticket_department_id
  AND c.category_name = 'Something else';

-- A ticket's department follows its category
UPDATE ticket t
SET ticket_department_id = c.department_id
FROM category c
WHERE c.category_id = t.ticket_category_id AND t.ticket_department_id IS NULL;

ALTER TABLE category ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE category ADD CONSTRAINT category_department_name_unique UNIQUE (department_id, category_name);
ALTER TABLE ticket ALTER COLUMN ticket_category_id SET NOT NULL;
CREATE INDEX ticket_category_idx ON ticket (ticket_category_id);
-- request_type and ticket.ticket_request_type_id stay for old data, but nothing reads or writes them

-- ---------------------------------------------------------------------------------------------
-- S1: users and departments (page 10)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN last_login_at        timestamptz;

-- Employees, Agents and Leads need a department (admins don't). NOT VALID enforces it on every new
-- or changed row right away; existing rows are only validated when none break the rule.
ALTER TABLE users
  ADD CONSTRAINT users_department_required
  CHECK (role NOT IN ('Employee', 'Agent', 'Department Lead') OR department_id IS NOT NULL) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE role IN ('Employee', 'Agent', 'Department Lead') AND department_id IS NULL
  ) THEN
    ALTER TABLE users VALIDATE CONSTRAINT users_department_required;
  END IF;
END $$;

-- One department per lead: when a user leads several, the lowest department id keeps them
UPDATE department d
SET lead_id = NULL
WHERE lead_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM department other
    WHERE other.lead_id = d.lead_id AND other.department_id < d.department_id
  );
ALTER TABLE department ADD CONSTRAINT department_lead_unique UNIQUE (lead_id);

-- ---------------------------------------------------------------------------------------------
-- S4: append-only history (page 13). Every mutation writes one row in the same transaction
-- (src/services/events.ts logEvent). Never updated, never deleted.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE ticket_event (
  event_id    bigserial PRIMARY KEY,
  ticket_id   integer NOT NULL REFERENCES ticket (ticket_id),
  actor_id    bigint REFERENCES users (user_id),            -- NULL = the system (e.g. auto-close)
  type        text NOT NULL CHECK (type IN (
                'created', 'claimed', 'assigned', 'status_changed', 'priority_changed',
                'approved', 'rejected', 'reopened', 'comment_deleted')),
  from_value  text,
  to_value    text,
  note        text,
  is_internal boolean NOT NULL DEFAULT false,               -- staff-only events never reach employees
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_event_ticket_created_idx ON ticket_event (ticket_id, created_at);

-- Existing tickets start their history with "created"
INSERT INTO ticket_event (ticket_id, actor_id, type, to_value, created_at)
SELECT ticket_id, requester_id, 'created', ticket_status::text, created_at FROM ticket;

-- Comments: edit marker and soft delete (the row stays; the timeline shows "Message removed").
-- comment.is_internal is the only place internal notes live; internal_note is no longer written.
ALTER TABLE comment
  ADD COLUMN edited_at  timestamptz,
  ADD COLUMN deleted_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- Indexes for the queues: department lists ordered by the nearest due time
-- ---------------------------------------------------------------------------------------------
CREATE INDEX ticket_department_status_idx ON ticket (ticket_department_id, ticket_status);
CREATE INDEX ticket_assignee_status_idx ON ticket (assignee_id, ticket_status);
CREATE INDEX ticket_requester_idx ON ticket (requester_id);
