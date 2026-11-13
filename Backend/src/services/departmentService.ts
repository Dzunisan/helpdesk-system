import { pool, withTransaction } from "../config/database";

export const createDepartment = async (
  name: string,
  description: string | null,
  status: string,
  leadId: string | null
) => {
  // A lead named on create also moves into the new department (same rule as PUT /:id/lead)
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO department (department_name, description, status, lead_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, status, leadId]
    );
    if (leadId) {
      await client.query("UPDATE users SET department_id = $1 WHERE user_id = $2", [result.rows[0].department_id, leadId]);
    }
    return result.rows[0];
  });
};

export const getDepartments = async (
  page: number,
  limit: number,
  status: string | null,
  search: string | null
) => {
  const where = "WHERE ($1::text IS NULL OR d.status = $1) AND ($2::text IS NULL OR d.department_name ILIKE '%' || $2 || '%')";

  const data = await pool.query(
    `SELECT d.*, 
            CASE WHEN u.user_id IS NOT NULL THEN TRIM(CONCAT(u.name, ' ', u.surname)) ELSE NULL END AS "departmentLead",
            u.name AS lead_name,
            u.surname AS lead_surname,
            u.email AS lead_email
     FROM department d
     LEFT JOIN users u ON d.lead_id::text = u.user_id::text
     ${where}
     ORDER BY d.department_name
     LIMIT $3 OFFSET $4`,
    [status, search, limit, (page - 1) * limit]
  );
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM department d ${where}`,
    [status, search]
  );

  return { departments: data.rows, total: count.rows[0].total };
};

export const getDepartmentById = async (id: number) => {
  const result = await pool.query(
    `SELECT d.*, 
            CASE WHEN u.user_id IS NOT NULL THEN TRIM(CONCAT(u.name, ' ', u.surname)) ELSE NULL END AS "departmentLead",
            u.name AS lead_name,
            u.surname AS lead_surname,
            u.email AS lead_email
     FROM department d
     LEFT JOIN users u ON d.lead_id::text = u.user_id::text
     WHERE d.department_id = $1`,
    [id]
  );
  return result.rows[0];
};

export const updateDepartment = async (
  id: number,
  name?: string | null,
  description?: string | null,
  status?: string | null,
  leadId?: string | null
) => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    fields.push(`department_name = $${paramIndex++}`);
    values.push(name);
  }
  if (description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(description);
  }
  if (status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  if (leadId !== undefined) {
    fields.push(`lead_id = $${paramIndex++}`);
    values.push(leadId);
  }

  if (fields.length === 0) {
    return getDepartmentById(id);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE department
       SET ${fields.join(", ")}
       WHERE department_id = $${paramIndex}
       RETURNING *`,
      values
    );
    // A newly named lead moves into the department (same rule as PUT /:id/lead)
    if (result.rows[0] && leadId) {
      await client.query("UPDATE users SET department_id = $1 WHERE user_id = $2", [id, leadId]);
    }
    return result.rows[0];
  });
};

/**
 * Why this department can't be deactivated yet, or null. A department with live work (any ticket not
 * Closed or Cancelled) or active people would strand them: their queue disappears and nobody can be
 * routed there. Move the people and finish the tickets first.
 */
export const deactivationProblem = async (id: number): Promise<string | null> => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM ticket
         WHERE ticket_department_id = $1 AND deleted_at IS NULL
           AND ticket_status NOT IN ('Closed', 'Cancelled')) AS live_tickets,
       (SELECT COUNT(*)::int FROM users WHERE department_id = $1 AND active) AS active_members`,
    [id]
  );
  const { live_tickets: tickets, active_members: members } = rows[0];
  const parts: string[] = [];
  if (tickets > 0) parts.push(`${tickets} ticket${tickets === 1 ? "" : "s"} still in progress`);
  if (members > 0) parts.push(`${members} active ${members === 1 ? "person" : "people"}`);
  if (parts.length === 0) return null;
  return `This department has ${parts.join(" and ")}. Move them or finish the work before you deactivate it.`;
};

export const softDeleteDepartment = async (id: number) => {
  const result = await pool.query(
    "UPDATE department SET status = 'inactive', updated_at = NOW() WHERE department_id = $1 RETURNING *",
    [id]
  );
  return result.rows[0];
};

export const getUserForLead = async (userId: string) => {
  const result = await pool.query(
    `SELECT u.user_id::text AS user_id, u.name, u.surname, u.email, u.role, u.active, u.department_id,
            (SELECT d.department_id FROM department d WHERE d.lead_id = u.user_id LIMIT 1) AS led_department_id,
            (SELECT d.department_name FROM department d WHERE d.lead_id = u.user_id LIMIT 1) AS led_department_name
     FROM users u WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0];
};

export type LeadCandidate = {
  user_id: string;
  name: string;
  surname: string;
  role: string;
  active: boolean;
  department_id: number | null;
  led_department_id: number | null;
  led_department_name: string | null;
};

/**
 * Why this user can't lead department `departmentId` (S1, page 10): only an active Department Lead
 * who leads no other department. Null when they can.
 */
export const leadProblem = (user: LeadCandidate, departmentId: number): string | null => {
  const name = `${user.name} ${user.surname}`.trim();
  if (user.role !== "Department Lead") return `${name} isn't a Department Lead. Change their role first.`;
  if (user.active !== true) return `${name} is deactivated.`;
  if (user.led_department_id !== null && Number(user.led_department_id) !== departmentId) {
    return `${name} already leads ${user.led_department_name}.`;
  }
  return null;
};

/**
 * Makes `leadId` the department's lead and moves the lead into that department
 * (users.department_id), in one transaction. The department.lead_id UNIQUE constraint backs the
 * one-department-per-lead rule if two admins race.
 */
export const assignDepartmentLead = async (departmentId: number, leadId: string) => {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE department
       SET lead_id = $1, updated_at = NOW()
       WHERE department_id = $2
       RETURNING *`,
      [leadId, departmentId]
    );
    await client.query("UPDATE users SET department_id = $1 WHERE user_id = $2", [departmentId, leadId]);
    return result.rows[0];
  });
};

export const removeDepartmentLead = async (departmentId: number) => {
  const result = await pool.query(
    `UPDATE department
     SET lead_id = NULL, updated_at = NOW()
     WHERE department_id = $1
     RETURNING *`,
    [departmentId]
  );
  return result.rows[0];
};
export const getUsersByIds = async (userIds: string[]) => {
  const result = await pool.query(
    `SELECT user_id, role, active, department_id
     FROM users
     WHERE user_id = ANY($1::bigint[])`,
    [userIds]
  );
  return result.rows;
};

export const addDepartmentMembers = async (departmentId: number, userIds: string[]) => {
  const result = await pool.query(
    `UPDATE users
     SET department_id = $1
     WHERE user_id = ANY($2::bigint[])
     RETURNING user_id, name, surname, email, role, department_id`,
    [departmentId, userIds]
  );
  return result.rows;
};

export const getDepartmentMember = async (departmentId: number, userId: string) => {
  const result = await pool.query(
    `SELECT user_id, name, surname, email, role, department_id
     FROM users
     WHERE user_id = $1 AND department_id = $2`,
    [userId, departmentId]
  );
  return result.rows[0];
};

export const removeDepartmentMember = async (departmentId: number, userId: string) => {
  const result = await pool.query(
    `UPDATE users
     SET department_id = NULL
     WHERE user_id = $1 AND department_id = $2
     RETURNING user_id, name, surname, email, role, department_id`,
    [userId, departmentId]
  );
  return result.rows[0];
};