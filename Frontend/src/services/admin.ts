/**
 * S9 System Admin tools (docs/api-sprint-2.md "S9"): Sent messages (the outbox) and Run jobs now.
 * Also S12's department category picker, used by the move-department dialog.
 */
import { api, call } from "./apiClient";
import type {
  Category,
  DepartmentCategoriesResponse,
  MoveDepartmentRequest,
  OutboxListParams,
  OutboxListResponse,
  RunJobsResponse,
  Ticket,
  TicketResponse,
} from "@/types/api";

/** GET /api/admin/outbox: every message the app sent or simulated, newest first */
export const listOutbox = (params: OutboxListParams = {}) =>
  call(() => api.get<OutboxListResponse>("/admin/outbox", { params }), "Couldn't load sent messages.");

/** POST /api/admin/jobs/run: breach alerts, 5-day auto-close + CSAT, queued emails */
export const runJobsNow = () => call(() => api.post<RunJobsResponse>("/admin/jobs/run"), "Couldn't run the jobs.");

/** GET /api/departments/:id/categories (S12 move picker): the department's active categories */
export const listDepartmentCategories = async (departmentId: number): Promise<Category[]> =>
  (
    await call(
      () => api.get<DepartmentCategoriesResponse>(`/departments/${departmentId}/categories`),
      "Couldn't load that department's categories.",
    )
  ).categories;

/** PATCH /api/tickets/:id/department (S12): 400 no reason, 409 Pending approval, then 404 for the old team */
export const moveTicketDepartment = async (ticketId: number, body: MoveDepartmentRequest): Promise<Ticket> =>
  (await call(() => api.patch<TicketResponse>(`/tickets/${ticketId}/department`, body), "Couldn't move the ticket.")).ticket;
