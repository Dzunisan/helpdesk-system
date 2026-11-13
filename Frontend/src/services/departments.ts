/** Sprint 1 department endpoints (docs/api-sprint-1.md: S1). Every function throws ApiError. */
import { api, call } from "./apiClient";
import type {
  AppointLeadRequest,
  Department,
  DepartmentListParams,
  DepartmentListResponse,
  DepartmentResponse,
} from "@/types/api";

/** GET /api/departments: everyone signed in */
export const listDepartments = (params: DepartmentListParams = { limit: 100 }) =>
  call(() => api.get<DepartmentListResponse>("/departments", { params }), "Couldn't load departments.");

/** PUT /api/departments/:id/lead: System Admin. 409 when that lead already leads another department. */
export const appointLead = async (departmentId: number, leadId: string): Promise<Department> =>
  (
    await call(
      () => api.put<DepartmentResponse>(`/departments/${departmentId}/lead`, { lead_id: leadId } satisfies AppointLeadRequest),
      "Couldn't appoint the lead.",
    )
  ).department;
