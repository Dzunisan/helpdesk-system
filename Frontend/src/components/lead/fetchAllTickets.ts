import { fetchTickets } from "@/services/ticketService";
import type { Ticket } from "@/types/ticket.types";

/**
 * Every ticket the lead can see, page by page (the API returns at most 100 at a time;
 * capped at 10 pages). The server scopes a lead to their own department.
 */
export async function fetchAllTickets(): Promise<Ticket[]> {
  const first = await fetchTickets({ limit: 100, page: 1 });
  const pages = Math.min(first.pagination?.totalPages ?? 1, 10);
  if (pages <= 1) return first.tickets;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchTickets({ limit: 100, page: i + 2 })),
  );
  return [first, ...rest].flatMap((r) => r.tickets);
}
