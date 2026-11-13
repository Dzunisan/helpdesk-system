/**
 * Types for the older ticket client (services/ticketService.ts). The vocabulary and the ticket
 * shape come from types/api.ts, the Sprint 1 contract, so both clients agree.
 */
import type { Ticket as ApiTicket, TicketPriority, TicketStatus } from "./api";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "./api";

export type { TicketPriority, TicketStatus };
export const VALID_PRIORITIES: TicketPriority[] = TICKET_PRIORITIES;
export const VALID_STATUSES: TicketStatus[] = TICKET_STATUSES;

export interface TicketComment {
  comment_id: number;
  ticket_id: number;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at?: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  author_name?: string;
  author_email?: string;
  author_role?: string;
}

export interface TicketFeedback {
  feedback_id: number;
  ticket_id: number;
  user_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  updated_at?: string;
  user_name?: string;
  user_email?: string;
}

export interface AgentUser {
  user_id: string;
  name: string;
  surname?: string;
  email: string;
  role: string;
  department_id?: number | null;
  department_name?: string | null;
}

export interface Ticket extends ApiTicket {
  comments?: TicketComment[];
  feedback?: TicketFeedback | null;
}

export interface CreateTicketPayload {
  title: string;
  description?: string | null;
  priority?: TicketPriority;
  /** The category decides the department (S5). Old callers may still send only department_id. */
  category_id?: number | null;
  department_id?: number | null;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  department_id?: number;
  creator_id?: string;
  assignee_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedTicketsResponse {
  tickets: Ticket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TicketApiResponse {
  message: string;
  ticket: Ticket;
}

export interface TicketApiError {
  message: string;
  errors?: string[];
}
