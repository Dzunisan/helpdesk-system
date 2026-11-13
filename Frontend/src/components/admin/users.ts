import type { Role, User } from "@/types/api";

/** "Thabo Nkosi" */
export const fullNameOf = (u: Pick<User, "name" | "surname">) => `${u.name ?? ""} ${u.surname ?? ""}`.trim() || "This user";

/** First name for sentences: "Thabo can't sign in…" */
export const givenNameOf = (u: Pick<User, "name" | "surname">) => u.name?.trim() || fullNameOf(u);

/**
 * Account status on the Users table (briefing p.61):
 * - `invited`: added by an admin and hasn't signed in yet (temporary password unused)
 * - `active`: can sign in
 * - `deactivated`: blocked on their very next request
 */
export type AccountStatus = "active" | "invited" | "deactivated";

export const accountStatusOf = (u: Pick<User, "active" | "last_login_at" | "must_change_password">): AccountStatus =>
  !u.active ? "deactivated" : !u.last_login_at && u.must_change_password ? "invited" : "active";

/** Roles that belong to a department (department required on create and edit) */
export const STAFF_ROLES: Role[] = ["Employee", "Agent", "Department Lead"];

export const needsDepartment = (role: Role | string | null | undefined) => STAFF_ROLES.includes(role as Role);

/** Sort by name, active people first */
export const byActiveThenName = (a: User, b: User) =>
  Number(b.active) - Number(a.active) || fullNameOf(a).localeCompare(fullNameOf(b));
