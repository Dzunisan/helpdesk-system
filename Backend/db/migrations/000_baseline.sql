-- 000: Baseline schema — the tables this backend already uses, rebuilt from the SQL in
-- src/services/*.ts (the team's real database was never committed). Types and keys follow
-- docs/Wireframing_and_Data_Modelling_v2.
-- Applied by `npm run db:migrate` (scripts/migrate.ts), which wraps each file in its own
-- transaction, so migration files must NOT contain BEGIN/COMMIT.
-- Never edit this file once applied anywhere: add a new numbered file (001_..., 002_...) instead.

CREATE TYPE user_role AS ENUM ('Employee', 'Agent', 'Department Lead', 'System Admin', 'Platform Admin');
CREATE TYPE ticket_status AS ENUM ('Open', 'In progress', 'Pending approval', 'Resolved', 'Closed', 'Cancelled');
CREATE TYPE ticket_priority AS ENUM ('High', 'Medium', 'Low');

CREATE TABLE department (
  department_id   serial PRIMARY KEY,
  department_name text NOT NULL UNIQUE,
  description     text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  lead_id         bigint,                       -- FK added after users exists
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id            bigint PRIMARY KEY,         -- their code uses Date.now() as the id
  name               text NOT NULL,
  surname            text NOT NULL,
  email              text NOT NULL UNIQUE,
  password           text NOT NULL,              -- bcrypt hash
  role               user_role NOT NULL DEFAULT 'Employee',
  active             boolean NOT NULL DEFAULT true,
  department_id      integer REFERENCES department (department_id),
  reset_token        text,
  reset_token_expiry timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE department
  ADD CONSTRAINT department_lead_fk FOREIGN KEY (lead_id) REFERENCES users (user_id);

CREATE TABLE category (
  category_id   serial PRIMARY KEY,
  department_id integer REFERENCES department (department_id),
  category_name text NOT NULL
);

CREATE TABLE request_type (
  request_type_id   serial PRIMARY KEY,
  department_id     integer REFERENCES department (department_id),
  request_type_name text NOT NULL,
  kind              text NOT NULL DEFAULT 'fix_it' CHECK (kind IN ('fix_it', 'provision')),
  extra_fields      text
);

CREATE TABLE ticket (
  ticket_id              serial PRIMARY KEY,
  title                  varchar(255) NOT NULL,
  description            text,
  ticket_department_id   integer REFERENCES department (department_id),
  ticket_category_id     integer REFERENCES category (category_id),
  ticket_request_type_id integer REFERENCES request_type (request_type_id),
  ticket_priority        ticket_priority NOT NULL DEFAULT 'Low',
  ticket_status          ticket_status NOT NULL DEFAULT 'Open',
  requester_id           bigint REFERENCES users (user_id),
  assignee_id            bigint REFERENCES users (user_id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

CREATE TABLE comment (
  comment_id  serial PRIMARY KEY,
  ticket_id   integer NOT NULL REFERENCES ticket (ticket_id),
  author_id   bigint NOT NULL REFERENCES users (user_id),
  body        text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Old table their code still writes internal notes into (alongside comment.is_internal)
CREATE TABLE internal_note (
  note_id    serial PRIMARY KEY,
  ticket_id  integer NOT NULL REFERENCES ticket (ticket_id),
  author     bigint NOT NULL REFERENCES users (user_id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_feedback (
  feedback_id serial PRIMARY KEY,
  ticket_id   integer NOT NULL UNIQUE REFERENCES ticket (ticket_id),  -- their code relies on ON CONFLICT (ticket_id)
  user_id     bigint NOT NULL REFERENCES users (user_id),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

