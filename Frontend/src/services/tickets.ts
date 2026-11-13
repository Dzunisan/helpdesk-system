/**
 * Sprint 1 ticket endpoints (docs/api-sprint-1.md: S1-S5). Every function throws ApiError
 * (services/apiClient.ts) with the HTTP status, so pages can show "Not found" on 404 and
 * refresh on 409.
 */
import { api, call } from "./apiClient";
import type {
  AddCommentRequest,
  AssignTicketRequest,
  ChangePriorityRequest,
  CommentResponse,
  CreateTicketRequest,
  Ticket,
  TicketActionsResponse,
  TicketListParams,
  TicketListResponse,
  TicketResponse,
  TimelineResponse,
  TransitionRequest,
  Comment,
} from "@/types/api";

/** Query params for GET /api/tickets: status lists go comma-separated */
const listQuery = (params: TicketListParams): Record<string, string | number> => {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query[key] = Array.isArray(value) ? value.join(",") : (value as string | number);
  }
  return query;
};

/** GET /api/tickets: scoped by role on the server (S1), sort=due / sla=breached (S3) */
export const listTickets = (params: TicketListParams = {}) =>
  call(() => api.get<TicketListResponse>("/tickets", { params: listQuery(params) }), "Couldn't load tickets.");

/** GET /api/tickets/:id: 404 when the ticket doesn't exist or the caller may not see it */
export const getTicket = async (id: number): Promise<Ticket> =>
  (await call(() => api.get<TicketResponse>(`/tickets/${id}`), "Couldn't load this ticket.")).ticket;

/** POST /api/tickets (S5): the category decides department, priority and status */
export const createTicket = async (body: CreateTicketRequest): Promise<Ticket> =>
  (await call(() => api.post<TicketResponse>("/tickets", body), "Couldn't submit your request.")).ticket;

/** POST /api/tickets/:id/claim (S2): owner = me, status Open. 409 when someone else got it first. */
export const claimTicket = async (id: number): Promise<Ticket> =>
  (await call(() => api.post<TicketResponse>(`/tickets/${id}/claim`), "Couldn't claim this ticket.")).ticket;

/** PATCH /api/tickets/:id/assign (S2): the lead assigns or reassigns */
export const assignTicket = async (id: number, body: AssignTicketRequest): Promise<Ticket> =>
  (await call(() => api.patch<TicketResponse>(`/tickets/${id}/assign`, body), "Couldn't assign this ticket.")).ticket;

/** POST /api/tickets/:id/transition (S2): 409 when the move isn't allowed, 403 for the wrong person */
export const transitionTicket = async (id: number, body: TransitionRequest): Promise<Ticket> =>
  (await call(() => api.post<TicketResponse>(`/tickets/${id}/transition`, body), "Couldn't update this ticket.")).ticket;

/** GET /api/tickets/:id/actions (S2): the buttons this user may see right now */
export const getTicketActions = (id: number) =>
  call(() => api.get<TicketActionsResponse>(`/tickets/${id}/actions`), "Couldn't load the ticket actions.");

/** PATCH /api/tickets/:id/priority (S3): both due times recalculate from created_at */
export const changePriority = async (id: number, priority: ChangePriorityRequest["priority"]): Promise<Ticket> =>
  (
    await call(
      () => api.patch<TicketResponse>(`/tickets/${id}/priority`, { priority } satisfies ChangePriorityRequest),
      "Couldn't change the priority.",
    )
  ).ticket;

/** GET /api/tickets/:id/timeline (S4): events + comments, oldest first, filtered by role */
export const getTimeline = (id: number) =>
  call(() => api.get<TimelineResponse>(`/tickets/${id}/timeline`), "Couldn't load the timeline.");

/** POST /api/tickets/:id/comments (S4): public reply or internal note */
export const addComment = async (ticketId: number, body: AddCommentRequest): Promise<Comment> =>
  (await call(() => api.post<CommentResponse>(`/tickets/${ticketId}/comments`, body), "Couldn't send your message.")).comment;

/** PATCH /api/comments/:id (S4): the author, within 15 minutes */
export const editComment = async (commentId: number, body: string): Promise<Comment> =>
  (await call(() => api.patch<CommentResponse>(`/comments/${commentId}`, { body }), "Couldn't edit the message.")).comment;

/** DELETE /api/comments/:id (S4): soft delete, the timeline keeps a "Message removed" marker */
export const deleteComment = async (commentId: number): Promise<Comment> =>
  (await call(() => api.delete<CommentResponse>(`/comments/${commentId}`), "Couldn't delete the message.")).comment;
