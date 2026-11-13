import axios, { AxiosError } from "axios";
/**
 * The older ticket client, kept only for screens that are rebuilt in Sprint 2: the lead's
 * Approvals page (S6), dashboard and team page (S8). Everything else uses services/tickets.ts,
 * the Sprint 1 contract (docs/api-sprint-1.md).
 */
import type { Ticket, TicketFilters, PaginatedTicketsResponse, TicketApiError, AgentUser } from "../types/ticket.types";

const API = `${import.meta.env.VITE_API_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

/**
 * Extracts a user-friendly error message from an API error response.
 */
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as TicketApiError;
    if (data.errors && data.errors.length > 0) {
      return data.errors.join(" ");
    }
    return data.message || "An unexpected error occurred.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
};

/**
 * Fetch tickets with optional filters and pagination.
 * GET /api/tickets
 */
export const fetchTickets = async (
  filters: TicketFilters = {}
): Promise<PaginatedTicketsResponse> => {
  try {
    const params: Record<string, string | number> = {};

    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.department_id !== undefined)
      params.department_id = filters.department_id;
    if (filters.creator_id) params.creator_id = filters.creator_id;
    if (filters.assignee_id) params.assignee_id = filters.assignee_id;
    if (filters.search) params.search = filters.search;
    if (filters.page) params.page = filters.page;
    if (filters.limit) params.limit = filters.limit;

    const response = await api.get<PaginatedTicketsResponse>("/tickets", {
      params,
    });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
};

/**
 * Approve a ticket pending approval (Lead/Admin).
 * PATCH /api/tickets/:id/approve
 */
export const approveTicket = async (
  ticketId: number,
  note?: string
): Promise<Ticket> => {
  try {
    const response = await api.patch<{ message: string; ticket: Ticket }>(
      `/tickets/${ticketId}/approve`,
      { note }
    );
    return response.data.ticket;
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
};

/**
 * Reject a ticket pending approval (Lead/Admin).
 * PATCH /api/tickets/:id/reject
 */
export const rejectTicket = async (
  ticketId: number,
  reason?: string
): Promise<Ticket> => {
  try {
    const response = await api.patch<{ message: string; ticket: Ticket }>(
      `/tickets/${ticketId}/reject`,
      { reason }
    );
    return response.data.ticket;
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
};

/**
 * Fetch available agents for ticket assignment/reassignment.
 * GET /api/tickets/agents
 */
export const fetchAgents = async (departmentId?: number): Promise<AgentUser[]> => {
  try {
    const params = departmentId ? { department_id: departmentId } : {};
    const response = await api.get<{ agents: AgentUser[] }>("/tickets/agents", { params });
    return response.data.agents || [];
  } catch (error) {
    throw new Error(extractErrorMessage(error), { cause: error });
  }
};
