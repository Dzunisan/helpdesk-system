/** Sprint 1 user endpoints (docs/api-sprint-1.md: S1). Every function throws ApiError. */
import { api, call } from "./apiClient";
import type {
  ChangePasswordRequest,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  User,
  UserListParams,
  UserListResponse,
  UserResponse,
} from "@/types/api";

/** GET /api/users: System Admin sees Employees, Agents and Leads; Platform Admin sees System Admins */
export const listUsers = async (params: UserListParams = {}): Promise<User[]> =>
  (await call(() => api.get<UserListResponse>("/users", { params }), "Couldn't load users.")).users;

/** POST /api/users: department required for Employee, Agent and Department Lead (400 otherwise) */
export const createUser = async (body: CreateUserRequest): Promise<User> =>
  (await call(() => api.post<CreateUserResponse>("/users", body), "Couldn't create the user.")).user;

/** PATCH /api/users/:id: edit name, email, role and department */
export const updateUser = async (id: string, body: UpdateUserRequest): Promise<User> =>
  (await call(() => api.patch<UserResponse>(`/users/${id}`, body), "Couldn't save the user.")).user;

/** PATCH /api/users/:id/active: deactivate or reactivate (there is no delete) */
export const setUserActive = async (id: string, active: boolean): Promise<User> =>
  (await call(() => api.patch<UserResponse>(`/users/${id}/active`, { active }), "Couldn't change the account.")).user;

/** POST /api/auth/change-password: clears must_change_password */
export const changePassword = async (body: ChangePasswordRequest): Promise<User> =>
  (await call(() => api.post<UserResponse>("/auth/change-password", body), "Couldn't change your password.")).user;
