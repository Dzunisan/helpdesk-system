import { pool } from "../config/database";
import { ACTIVE_STATUSES } from "../types/ticket.types";
import { SQL_IS_BREACHED } from "./sla";

// Statuses that still need work. Kept here so every count agrees on what "open" means.
const OPEN_STATUSES: string[] = ACTIVE_STATUSES;

export interface AdminOverviewDepartment {
  department_id: number;
  department_name: string;
  status: string;
  lead_id: string | null;
  lead_name: string | null;
  agents: number;
  open_tickets: number;
  /** Open tickets past a due time (the same rule as the queues' Breached view) */
  breached_tickets: number;
}

export interface AdminOverview {
  totals: {
    active_users: number;
    inactive_users: number;
    active_departments: number;
    inactive_departments: number;
    open_tickets: number;
    breached_tickets: number;
  };
  departments: AdminOverviewDepartment[];
  checklist: {
    departments_without_lead: { department_id: number; department_name: string }[];
    users_without_department: number;
  };
}

/**
 * Organisation totals for the System Admin overview (briefing p.60).
 * Counts only: no ticket titles, descriptions or comments ever leave this query,
 * so HR tickets stay private.
 */
export const getAdminOverview = async (): Promise<AdminOverview> => {
  const [users, departments, openTickets, perDepartment, usersWithoutDepartment] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE active)::int AS active,
              COUNT(*) FILTER (WHERE NOT active)::int AS inactive
       FROM users`
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE status <> 'active')::int AS inactive
       FROM department`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ${SQL_IS_BREACHED})::int AS breached
       FROM ticket t
       WHERE t.deleted_at IS NULL AND t.ticket_status::text = ANY($1)`,
      [OPEN_STATUSES]
    ),
    pool.query(
      `SELECT d.department_id,
              d.department_name,
              d.status,
              d.lead_id::text AS lead_id,
              CASE WHEN l.user_id IS NOT NULL THEN TRIM(CONCAT(l.name, ' ', l.surname)) END AS lead_name,
              (SELECT COUNT(*)::int FROM users a
                WHERE a.department_id = d.department_id AND a.role = 'Agent' AND a.active) AS agents,
              (SELECT COUNT(*)::int FROM ticket t
                WHERE t.ticket_department_id = d.department_id
                  AND t.deleted_at IS NULL
                  AND t.ticket_status::text = ANY($1)) AS open_tickets,
              (SELECT COUNT(*)::int FROM ticket t
                WHERE t.ticket_department_id = d.department_id
                  AND t.deleted_at IS NULL
                  AND t.ticket_status::text = ANY($1)
                  AND ${SQL_IS_BREACHED}) AS breached_tickets
       FROM department d
       LEFT JOIN users l ON l.user_id = d.lead_id
       ORDER BY d.department_name`,
      [OPEN_STATUSES]
    ),
    // Employees, agents and leads need a department to submit or claim tickets; admins don't
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE active AND department_id IS NULL
         AND role IN ('Employee', 'Agent', 'Department Lead')`
    ),
  ]);

  const departmentRows: AdminOverviewDepartment[] = perDepartment.rows;

  return {
    totals: {
      active_users: users.rows[0].active,
      inactive_users: users.rows[0].inactive,
      active_departments: departments.rows[0].active,
      inactive_departments: departments.rows[0].inactive,
      open_tickets: openTickets.rows[0].total,
      breached_tickets: openTickets.rows[0].breached,
    },
    departments: departmentRows,
    checklist: {
      departments_without_lead: departmentRows
        .filter((d) => d.status === "active" && !d.lead_id)
        .map((d) => ({ department_id: d.department_id, department_name: d.department_name })),
      users_without_department: usersWithoutDepartment.rows[0].total,
    },
  };
};
