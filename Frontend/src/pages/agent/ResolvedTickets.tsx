import { useMemo, useState } from "react";
import { CircleCheck, SearchX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTickets } from "@/hooks/useTickets";
import type { Ticket } from "@/types/ticket.types";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListCaption } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";
import OwnedTicketTable from "@/components/queue/OwnedTicketTable";
import { byRecentlyUpdated, isDone, matchesSearch, plural, sastDayKey } from "@/components/queue/queueUtils";

type DateRange = "all" | "today" | "7days" | "30days";

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGES: { value: DateRange; label: string; empty: string }[] = [
  { value: "all", label: "All time", empty: "" },
  { value: "today", label: "Today", empty: "today" },
  { value: "7days", label: "7 days", empty: "in the last 7 days" },
  { value: "30days", label: "30 days", empty: "in the last 30 days" },
];

/** When the ticket was last touched; the closest the data has to a resolved date */
const doneAt = (ticket: Ticket) => ticket.updated_at || ticket.created_at;

/** "Resolved by me": tickets I resolved or closed (briefing p.53) */
export default function ResolvedTickets() {
  const { user } = useAuth();
  const userId = user?.id || user?.user_id || "";

  const [range, setRange] = useState<DateRange>("all");
  const [search, setSearch] = useState("");
  // Day boundaries are taken when the page opens
  const [now] = useState(() => Date.now());

  const { tickets, loading, isRefetching, error, refetch } = useTickets({
    filters: { assignee_id: userId ? String(userId) : undefined, limit: 100 },
    autoFetch: !!userId,
  });

  const done = useMemo(() => tickets.filter(isDone).sort(byRecentlyUpdated), [tickets]);

  const inRange = useMemo(() => {
    const today = sastDayKey(now);
    // "Last 7 days" starts at midnight (SAST) six days ago, so today counts as one of the seven
    const since = (days: number) => sastDayKey(now - (days - 1) * DAY_MS);
    return (ticket: Ticket, r: DateRange) => {
      if (r === "all") return true;
      const day = sastDayKey(doneAt(ticket));
      if (r === "today") return day === today;
      return day >= since(r === "7days" ? 7 : 30) && day <= today;
    };
  }, [now]);

  const counts = useMemo(() => {
    const result: Record<DateRange, number> = { all: 0, today: 0, "7days": 0, "30days": 0 };
    for (const t of done) for (const r of RANGES) if (inRange(t, r.value)) result[r.value] += 1;
    return result;
  }, [done, inRange]);

  const visible = useMemo(
    () => done.filter((t) => inRange(t, range) && matchesSearch(t, search)),
    [done, range, search, inRange],
  );

  const showCounts = !loading && !error;
  const description = showCounts
    ? `${plural(done.length, "ticket")} you resolved or closed · most recent first`
    : "Tickets you resolved or closed";
  const rangeMeta = RANGES.find((r) => r.value === range)!;

  const empty =
    done.length === 0 ? (
      <EmptyState
        icon={CircleCheck}
        title="Nothing resolved yet"
        description="Tickets you resolve or close will be listed here."
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
        icon={CircleCheck}
        title={`Nothing resolved ${rangeMeta.empty}`}
        description="Pick a longer range to see earlier tickets."
        action={
          <Button variant="outline" onClick={() => setRange("all")}>
            Show all time
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Resolved by me" description={description} />

      <Toolbar>
        <FilterTabs
          aria-label="Filter by when the ticket was last updated"
          value={range}
          onValueChange={setRange}
          items={RANGES.map((r) => ({ value: r.value, label: r.label, count: showCounts ? counts[r.value] : undefined }))}
        />
        <SearchInput
          id="resolved-search"
          value={search}
          onValueChange={setSearch}
          placeholder="Search subject, requester or HD"
        />
      </Toolbar>

      {error && !loading ? (
        <ErrorState title="Couldn't load your resolved tickets" onRetry={() => refetch()} retrying={isRefetching} />
      ) : (
        <OwnedTicketTable tickets={visible} loading={loading} basePath="/agent" dateLabel="Last updated" empty={empty} />
      )}

      {showCounts && done.length > 0 && (
        <ListCaption className="-mt-5">
          Showing {visible.length} of {done.length} · dates are when the ticket was last updated
        </ListCaption>
      )}
    </div>
  );
}
