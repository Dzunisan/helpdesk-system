# Helpdesk / Support Ticket Management System

## Project Status

**Current Phase:** Planning

---

## Start Here

**Do not start coding yet.**

Before beginning development, your team must read the central
**Intern Project Planning Guide** and complete all five planning
deliverables.

👉 [Read the Intern Project Planning Guide](https://github.com/cohort-2026/intern-programme/blob/main/planning-guide.md)

Your team will be expected to understand the client's problem,
identify stakeholders and users, define requirements, create
user stories and acceptance criteria, and create user flows.

Development may only begin once the planning phase has been
reviewed and approved by your mentor.

---

## Client Brief

Please read the client brief carefully.

We are a growing company and currently receive support requests through different channels. Employees report issues through WhatsApp, email and directly to members of the support team. As the number of employees grows, we are finding it increasingly difficult to manage these requests consistently.

We would like to explore a digital solution that could help us manage our support process.

We need to be able to see what is happening with requests, know who is dealing with them and have a record of what has happened.

We would also like employees to have better visibility of the issues they have reported.

We are open to your team's recommendations on how the system should work.

---

## Planning Deliverables

Your team must complete:

1. Problem Understanding
2. Stakeholders and Users
3. System Requirements
4. User Stories and Acceptance Criteria
5. User Flows

See the [full Planning Guide](https://github.com/cohort-2026/intern-programme/blob/main/planning-guide.md)
for detailed instructions.

---

## Team

**Helpdesk Team**

[View team on GitHub](https://github.com/orgs/cohort-2026/teams/helpdesk-team)

---

## Documentation

Your project documentation should be stored inside the `docs/`
directory.

The client brief is available here:

`docs/client-brief.md`

---

## Development

Development must not begin until the planning phase has been
reviewed and approved by your mentor.

---

## Run locally

You need Node.js 20+, pnpm (or npm) and a local PostgreSQL server.

**Backend** (`Backend/`)

```bash
cd Backend
pnpm install
cp .env.example .env      # then set DB_USER / DB_PASSWORD / DB_DATABASE and JWT_SECRET
createdb helpdesk_dev     # once; must match DB_DATABASE
pnpm db:reset             # drops the local schema, applies db/migrations, loads demo data
pnpm dev                  # API on http://localhost:$SERVER_PORT
```

Other scripts: `pnpm db:migrate` applies only new files in `db/migrations`,
`pnpm db:seed` reloads the demo data, `pnpm typecheck` runs the TypeScript checker.
`db:seed` and `db:reset` only run when `DB_HOST` is `localhost` or `127.0.0.1`.
Schema changes go in a new numbered file such as `db/migrations/001_add_x.sql`;
never edit a migration that has already been applied.

Demo logins (password `Demo2026!`): `lerato@`, `thabo@`, `thandi@`, `ayesha@`,
`ruan@` and `kerryanne@mzansifreight.co.za`.

**Frontend** (`Frontend/`)

```bash
cd Frontend
pnpm install
cp .env.example .env      # VITE_API_URL=http://localhost:5050 (the backend's SERVER_PORT)
pnpm dev                  # http://localhost:5173
```

npm works too (`npm install`, `npm run db:reset`, `npm run dev`).
