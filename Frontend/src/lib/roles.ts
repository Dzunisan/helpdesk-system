import type { Role, User } from "@/context/AuthContext";

/** Each role's home: the base path of its routes in AppRouter */
export const ROLE_HOME: Record<NonNullable<Role>, string> = {
  Employee: "/employee",
  Agent: "/agent",
  "Department Lead": "/department-lead",
  "System Admin": "/system-admin",
  "Platform Admin": "/platform-admin",
};

export const homePathFor = (role: Role | undefined): string =>
  role ? ROLE_HOME[role] ?? "/" : "/";

export const profilePathFor = (role: Role | undefined): string =>
  role ? `${homePathFor(role)}/profile` : "/";

export const fullName = (user: Pick<User, "name" | "surname"> | null | undefined): string =>
  user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() || "User" : "User";

export const initials = (user: Pick<User, "name" | "surname"> | null | undefined): string => {
  const letters = `${user?.name?.[0] ?? ""}${user?.surname?.[0] ?? ""}`.toUpperCase();
  return letters || "U";
};
