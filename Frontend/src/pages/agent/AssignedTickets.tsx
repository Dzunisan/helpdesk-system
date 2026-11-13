import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp, Inbox, SearchX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTickets } from "@/hooks/useTickets";
import { toStatus } from "@/lib/ticketVocabulary";
import type { Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListCaption } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import FilterSelect from "@/components/queue/FilterSelect";
import OwnedTicketTable from "@/components/queue/OwnedTicketTable";
import { byOldestUpdated, byRecentlyUpdated, byUrgency, isActive, matchesSearch, plural } from "@/components/queue/queueUtils";

type TabKey = "all" | "open" | "pending";
type SortOption = "priority" | "newest" | "oldest";

const SORTS: { value: SortOption; label: string }[] = [
  { value: "priority", label: "Highest priority" },
  { value: "newest", label: "Recently updated" },
  { value: "oldest", label: "Least recently updated" },
];

const SORT_FN: Record<SortOption, (a: Ticket, b: Ticket) => number> = {
  priority: byUrgency,
  newest: byRecentlyUpdated,
  oldest: byOldestUpdated,
};

const inTab = (ticket: Ticket, tab: TabKey) => {
  if (tab === "all") return true;
  const status = toStatus(ticket.ticket_status);
  return tab === "pending" ? status === "pending" : status !== "pending";
};

/** "My open": the tickets I own and still have to finish (briefing p.53) */
export default function AssignedTickets() {
  const { user } = useAuth();
  const userId = user?.id || user?.user_id || "";

  const [tab, setTab] = useState<TabKey>("all");
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [search, setSearch] = useState("");

  const { tickets, loading, isRefetching, error, refetch } = useTickets({
    filters: { assignee_id: userId ? String(userId) : undefined, limit: 100 },
    autoFetch: !!userId,
  });

  const active = useMemo(() => tickets.filter(isActive), [tickets]);
  const counts = useMemo(
    () => ({
      all: active.length,
      open: active.filter((t) => inTab(t, "open")).length,
      pending: active.filter((t) => inTab(t, "pending")).length,
    }),
    [active],
  );

  const visible = useMemo(
    () => active.filter((t) => inTab(t, tab) && matchesSearch(t, search)).sort(SORT_FN[sortBy]),
    [active, tab, search, sortBy],
  );

  const showCounts = !loading && !error;
  const description = showCounts
    ? `${plural(active.length, "ticket")} you own · ${SORTS.find((s) => s.value === sortBy)!.label.toLowerCase()} first`
    : "Tickets you own and still have to finish";

  const empty =
    active.length === 0 ? (
      <EmptyState
        icon={Inbox}
        title="Nothing assigned to you"
        description="Claim a ticket from the queue and it will show up here."
        action={
          <Button variant="outline" asChild>
            <Link to="/agent/ticket-queue">Open the queue</Link>
          </Button>
        }
      />
    ) : search.trim() ? (
      <EmptyState
        icon={SearchX}
        title="Nothing matches your search"
        description="Try a different word, a name or the HD number."
        action={
          <Button variant="outline" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={Inbox}
        title={tab === "pending" ? "Nothing waiting for approval" : "No open tickets"}
        description={
          tab === "pending"
            ? "Tickets you send for approval wait here until the lead decides."
            : "Everything you own is waiting for approval."
        }
      />
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="My open" description={description} />

      <Toolbar>
        <FilterTabs
          aria-label="Filter my tickets by status"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "all", label: "All", count: showCounts ? counts.all : undefined },
            { value: "open", label: "Open", count: showCounts ? counts.open : undefined },
            { value: "pending", label: "Pending approval", count: showCounts ? counts.pending : undefined },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterSelect label="Sort tickets" icon={ArrowDownUp} value={sortBy} onValueChange={setSortBy} options={SORTS} />
          <SearchInput
            id="assigned-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Search title, name or HD number"
          />
        </div>
      </Toolbar>

      {error && !loading ? (
        <ErrorState title="Couldn't load your tickets" onRetry={() => refetch()} retrying={isRefetching} />
      ) : (
        <OwnedTicketTable tickets={visible} loading={loading} basePath="/agent" dateLabel="Updated" empty={empty} />
      )}

      {showCounts && active.length > 0 && (
        <ListCaption className="-mt-5">
          Showing {visible.length} of {plural(active.length, "open ticket")}
        </ListCaption>
      )}
    </div>
  );
}
