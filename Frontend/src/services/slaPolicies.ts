/** Sprint 1 SLA policy endpoints (docs/api-sprint-1.md: S3). Every function throws ApiError. */
import { api, call } from "./apiClient";
import type {
  SlaPolicy,
  SlaPolicyListResponse,
  SlaPolicyResponse,
  TicketPriority,
  UpdateSlaPolicyRequest,
} from "@/types/api";

/** GET /api/sla-policies: everyone signed in; ordered Urgent, High, Normal, Low */
export const listSlaPolicies = async (): Promise<SlaPolicy[]> =>
  (await call(() => api.get<SlaPolicyListResponse>("/sla-policies"), "Couldn't load the SLA policies.")).policies;

/** PUT /api/sla-policies/:priority: System Admin; new tickets and later priority changes only */
export const updateSlaPolicy = async (priority: TicketPriority, body: UpdateSlaPolicyRequest): Promise<SlaPolicy> =>
  (
    await call(
      () => api.put<SlaPolicyResponse>(`/sla-policies/${encodeURIComponent(priority)}`, body),
      "Couldn't save the SLA policy.",
    )
  ).policy;
