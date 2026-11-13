import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTickets } from "../../hooks/useTickets";
import { toast } from "sonner";
import type { Ticket } from "../../types/ticket.types";
import Loader from "../../components/legacy/Loader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { PRIORITY_RANK, toPriority } from "@/lib/ticketVocabulary";

type SortOption = "newest" | "oldest" | "priority";

const AssignedTickets = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const userId = user?.id || user?.user_id || "";

  const { tickets, loading, error } = useTickets({
    filters: {
      assignee_id: userId ? String(userId) : undefined,
      limit: 100,
    },
    autoFetch: !!userId,
  });

  // Only show active (non-resolved/closed) assigned tickets
  const activeTickets = tickets.filter(
    (t) =>
      t.ticket_status !== "Resolved" &&
      t.ticket_status !== "Closed" &&
      t.ticket_status !== "Cancelled"
  );

  const filteredTickets = activeTickets
    .filter((ticket: Ticket) => {
      return (
        `HD-${ticket.ticket_id}`.toLowerCase().includes(search.toLowerCase()) ||
        ticket.title.toLowerCase().includes(search.toLowerCase()) ||
        (ticket.requester_name || "").toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        return (
          PRIORITY_RANK[toPriority(b.ticket_priority)] -
          PRIORITY_RANK[toPriority(a.ticket_priority)]
        );
      }

      if (sortBy === "oldest") {
        return (
          new Date(a.updated_at || a.created_at).getTime() -
          new Date(b.updated_at || b.created_at).getTime()
        );
      }

      return (
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
      );
    });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Show fetch errors once per error (calling toast during render loops forever)
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return (
    <div className="space-y-6">

      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Assigned Tickets
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage tickets assigned to you.
        </p>
      </div>

      {/* Search and Sorting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          id="assigned-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, title or reporter…"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-primary sm:max-w-md transition-colors"
        />

        <select
          id="assigned-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="newest">Recently Updated</option>
          <option value="oldest">Oldest Updated</option>
          <option value="priority">Priority: High to Low</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
            <Loader/>

      )}

      {/* Assigned Ticket Cards */}
      {!loading && (
        <div className="space-y-3">
          {filteredTickets.length > 0 ? (
            filteredTickets.map((ticket: Ticket) => (
              <div
                key={ticket.ticket_id}
                className="flex flex-col gap-3 rounded-md border border-gray-300 bg-white p-4 transition hover:border-primary hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Ticket Information */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">
                    HD-{ticket.ticket_id}
                  </p>

                  <h3 className="text-sm font-semibold text-gray-800">
                    {ticket.title}
                  </h3>

                  <p className="text-xs text-gray-500">
                    Reporter: {ticket.requester_name || "Unknown"}
                  </p>

                  <p className="text-xs text-gray-500">
                    Last updated: {formatDate(ticket.updated_at || ticket.created_at)}
                  </p>
                </div>

                {/* Priority and Status */}
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={ticket.ticket_priority} />
                  <StatusBadge status={ticket.ticket_status} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No assigned tickets found.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {activeTickets.length === 0
                  ? "You don't have any active tickets. Claim one from the ticket queue!"
                  : "No tickets match your current search."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ticket Count */}
      {!loading && activeTickets.length > 0 && (
        <p className="text-xs text-gray-500">
          Showing {filteredTickets.length} of {activeTickets.length} assigned tickets
        </p>
      )}
    </div>
  );
};

export default AssignedTickets;
