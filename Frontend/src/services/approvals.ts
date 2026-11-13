/**
 * S6 approvals (docs/api-sprint-2.md "S6"). Department Leads only; the server forces their own
 * department. Every function throws ApiError (services/apiClient.ts).
 */
import { api, call } from "./apiClient";
import type {
  ApprovalCountResponse,
  ApprovalListParams,
  ApprovalListResponse,
  ApproveRequest,
  RejectRequest,
  Ticket,
  TicketResponse,
} from "@/types/api";

/** GET /api/approvals?status=pending (default) or ?decided_by=me (History tab) */
export const listApprovals = (params: ApprovalListParams = { status: "pending" }) =>
  call(() => api.get<ApprovalListResponse>("/approvals", { params }), "Couldn't load approvals.");

/** GET /api/approvals/count: the sidebar's "Approvals (3)" */
export const countPendingApprovals = async (): Promise<number> =>
  (await call(() => api.get<ApprovalCountResponse>("/approvals/count"), "Couldn't count approvals.")).pending;

/** POST /api/tickets/:id/approve { note? }: Pending approval -> New, the SLA clocks start now */
export const approveRequest = async (ticketId: number, body: ApproveRequest = {}): Promise<Ticket> =>
  (await call(() => api.post<TicketResponse>(`/tickets/${ticketId}/approve`, body), "Couldn't approve the request.")).ticket;

/** POST /api/tickets/:id/reject { reason }: -> Cancelled; the requester sees the reason. 400 without one. */
export const rejectRequest = async (ticketId: number, body: RejectRequest): Promise<Ticket> =>
  (await call(() => api.post<TicketResponse>(`/tickets/${ticketId}/reject`, body), "Couldn't reject the request.")).ticket;
