import type { PoolClient } from "pg";
import { query } from "../config/database";
import bcrypt from "bcryptjs";
import { User, CreateUserDto, UpdateUserDto } from "../types/user.types";

/** Roles that work inside one department: department_id is required for them (S1, page 10) */
export const DEPARTMENT_ROLES = ["Employee", "Agent", "Department Lead"];
export const ADMIN_ROLES = ["System Admin", "Platform Admin"];
export const ALL_ROLES = [...DEPARTMENT_ROLES, ...ADMIN_ROLES];

// The only user fields that leave the server for the signed-in user (login, /me, req.user).
// password, reset_token and reset_token_expiry never do.
export const toPublicUser = (user: User): User => ({
  user_id: user.user_id,
  name: user.name,
  surname: user.surname,
  email: user.email,
  role: user.role,
  active: user.active,
  department_id: user.department_id ?? null,
  created_at: user.created_at,
  must_change_password: user.must_change_password ?? false,
  last_login_at: user.last_login_at ?? null,
});

/** The admin view of a user (docs/api-sprint-1.md "User"): department name and the department they lead */
export interface UserView {
  user_id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  active: boolean;
  department_id: number | null;
  department_name: string | null;
  led_department_id: number | null;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

const USER_VIEW_SELECT = `
  SELECT u.user_id::text AS user_id, u.name, u.surname, u.email, u.role, u.active,
         u.department_id, d.department_name,
         (SELECT ld.department_id FROM department ld WHERE ld.lead_id = u.user_id LIMIT 1) AS led_department_id,
         u.must_change_password, u.last_login_at, u.created_at
  FROM users u
  LEFT JOIN department d ON d.department_id = u.department_id`;

// Emails are matched without regard to case, so "Thabo@..." signs in as "thabo@..."
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const { rows } = await query("SELECT * FROM users WHERE lower(email) = lower($1)", [String(email).trim()]);
  return rows[0] || null;
};

export const findById = async (userId: string): Promise<User | null> => {
  const { rows } = await query("SELECT * FROM users WHERE user_id = $1", [userId]);
  return rows[0] || null;
};

export const getUserView = async (userId: string): Promise<UserView | null> => {
  const { rows } = await query(`${USER_VIEW_SELECT} WHERE u.user_id = $1`, [userId]);
  return rows[0] || null;
};

export interface UserListFilters {
  /** The roles the caller may see (System Admin: Employee/Agent/Lead; Platform Admin: System Admin) */
  roles: string[];
  role?: string | null;
  department_id?: number | null;
  active?: boolean | null;
  search?: string | null;
}

/** GET /api/users: newest first, filtered by role, department, active and a name/email search */
export const listUsers = async (filters: UserListFilters): Promise<UserView[]> => {
  const where: string[] = ["u.role::text = ANY($1::text[])"];
  const values: unknown[] = [filters.roles];
  if (filters.role) {
    values.push(filters.role);
    where.push(`u.role::text = $${values.length}`);
  }
  if (filters.department_id !== undefined && filters.department_id !== null) {
    values.push(filters.department_id);
    where.push(`u.department_id = $${values.length}`);
  }
  if (filters.active !== undefined && filters.active !== null) {
    values.push(filters.active);
    where.push(`u.active = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const p = `$${values.length}`;
    where.push(`(CONCAT(u.name, ' ', u.surname) ILIKE ${p} OR u.email ILIKE ${p})`);
  }
  const { rows } = await query(
    `${USER_VIEW_SELECT} WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC, u.user_id DESC`,
    values
  );
  return rows;
};

export const departmentExists = async (departmentId: number): Promise<{ department_id: number; status: string } | null> => {
  const { rows } = await query("SELECT department_id, status FROM department WHERE department_id = $1", [departmentId]);
  return rows[0] || null;
};

/** The department this user leads (department.lead_id), or null */
export const ledDepartmentOf = async (userId: string): Promise<{ department_id: number; department_name: string } | null> => {
  const { rows } = await query(
    "SELECT department_id, department_name FROM department WHERE lead_id = $1 LIMIT 1",
    [userId]
  );
  return rows[0] || null;
};

/** Is this email used by someone other than `exceptUserId`? Case-insensitive. */
export const emailTaken = async (email: string, exceptUserId?: string): Promise<boolean> => {
  const { rowCount } = await query(
    "SELECT 1 FROM users WHERE lower(email) = lower($1) AND ($2::bigint IS NULL OR user_id <> $2::bigint)",
    [email, exceptUserId ?? null]
  );
  return (rowCount ?? 0) > 0;
};

/**
 * Inserts a user. Without a user_id the next number after the highest id is used (1025, 1026, ...),
 * retried once when two admins create a user at the same moment.
 */
export const createUser = async (userData: CreateUserDto & { must_change_password?: boolean }): Promise<User> => {
  const {
    user_id,
    name,
    surname,
    email,
    password,
    role = "Employee",
    active = true,
    department_id = null,
    must_change_password = false,
  } = userData;
  const hashedPassword = password ? await bcrypt.hash(password, 10) : "";
  const insert = () =>
    query(
      `INSERT INTO users (user_id, name, surname, email, password, role, active, department_id, must_change_password)
       VALUES (COALESCE($1::bigint, (SELECT COALESCE(MAX(user_id), 1000) + 1 FROM users)), $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [user_id || null, name, surname, email, hashedPassword, role, active, department_id, must_change_password]
    );
  try {
    const { rows } = await insert();
    return rows[0];
  } catch (error: any) {
    if (error?.code === "23505" && error?.constraint === "users_pkey" && !user_id) {
      const { rows } = await insert();
      return rows[0];
    }
    throw error;
  }
};

const UPDATABLE_COLUMNS = new Set([
  "name",
  "surname",
  "email",
  "password",
  "role",
  "active",
  "department_id",
  "must_change_password",
]);

export const updateUser = async (user_id: string, updateData: UpdateUserDto & { must_change_password?: boolean }): Promise<User | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updateData)) {
    if (value === undefined || !UPDATABLE_COLUMNS.has(key)) continue;
    fields.push(`${key} = $${paramIndex}`);
    values.push(key === "password" ? await bcrypt.hash(String(value), 10) : value);
    paramIndex++;
  }

  if (fields.length === 0) return null;

  values.push(user_id);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(", ")} WHERE user_id = $${paramIndex} RETURNING *`,
    values
  );
  return rows[0] || null;
};

/** Stamps last_login_at (S1) and returns the fresh row */
export const stampLastLogin = async (userId: string): Promise<User | null> => {
  const { rows } = await query("UPDATE users SET last_login_at = now() WHERE user_id = $1 RETURNING *", [userId]);
  return rows[0] || null;
};

/** Sets a new password the user chose themselves: clears must_change_password and any reset link */
export const setOwnPassword = async (userId: string, newPassword: string): Promise<User | null> => {
  const hashed = await bcrypt.hash(newPassword, 10);
  const { rows } = await query(
    `UPDATE users
     SET password = $1, must_change_password = false, reset_token = NULL, reset_token_expiry = NULL
     WHERE user_id = $2
     RETURNING *`,
    [hashed, userId]
  );
  return rows[0] || null;
};

export const setResetToken = async (userId: string, token: string, expiry: Date) => {
  await query(
    "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE user_id = $3",
    [token, expiry, userId]
  );
};

export const findUserByResetToken = async (token: string) => {
  const result = await query("SELECT * FROM users WHERE reset_token = $1", [token]);
  return result.rows[0];
};

// A password chosen through the reset link is the user's own, so it also clears must_change_password
export const updatePasswordAndClearToken = async (userId: string, hashedPassword: string) => {
  await query(
    `UPDATE users
     SET password = $1, reset_token = NULL, reset_token_expiry = NULL, must_change_password = false
     WHERE user_id = $2`,
    [hashedPassword, userId]
  );
};

/** For callers that need the change inside their own transaction */
export const setUserDepartment = async (client: PoolClient, userId: string, departmentId: number) => {
  await client.query("UPDATE users SET department_id = $1 WHERE user_id = $2", [departmentId, userId]);
};

