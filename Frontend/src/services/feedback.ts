/**
 * S10 CSAT survey for one ticket (docs/api-sprint-2.md "S10"). One rating per ticket: a second
 * submit answers 409 ("Thanks, you already rated this"). Staff can't rate (403).
 */
import { api, call } from "./apiClient";
import type { FeedbackResponse, SubmitCsatRequest, TicketFeedback } from "@/types/api";

/** GET /api/tickets/:id/feedback: the rating, or null when not rated yet (requester or department staff) */
export const getTicketFeedback = async (ticketId: number): Promise<TicketFeedback | null> =>
  (
    await call(
      () => api.get<{ feedback: TicketFeedback | null }>(`/tickets/${ticketId}/feedback`),
      "Couldn't load the rating.",
    )
  ).feedback;

/** POST /api/tickets/:id/feedback { rating, tags, comment }: 409 when already rated or not Closed */
export const submitCsat = async (ticketId: number, body: SubmitCsatRequest): Promise<TicketFeedback> =>
  (await call(() => api.post<FeedbackResponse>(`/tickets/${ticketId}/feedback`, body), "Couldn't send your rating.")).feedback;
