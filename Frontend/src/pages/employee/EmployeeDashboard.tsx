import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Inbox, Plus, SearchX, Users } from "lucide-react";
import { useTickets } from "@/hooks/useTickets";
import type { Ticket } from "@/types/ticket.types";
import { toStatus, type Status } from "@/lib/ticketVocabulary";
import { formatSast } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { Button } from "@/components/ui/button";

type TabKey = "active" | "resolved" | "closed" | "cancelled";

const TABS: { key: TabKey; label: string; statuses: Status[] }[] = [
  { key: "active", label: "Active", statuses: ["new", "open", "waiting", "pending"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

// One grid for the header row, every ticket row and the loading rows, so the columns line up exactly
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_11rem_13rem_7rem_1rem] md:items-center md:gap-6";

function WhoHasIt({ ticket }: { ticket: Ticket }) {
  if (ticket.assignee_name) return <UserAvatar name={ticket.assignee_name} size="sm" showName />;
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      <span className="truncate text-sm">
        {ticket.department_name ? `${ticket.department_name} team` : "Not yet assigned"}
      </span>
    </div>
  );
}

export default function EmployeeDashboard() {
  const [tab, setTab] = useState<TabKey>("active");
  const [search, setSearch] = useState("");

  const { tickets, loading, error, refetch } = useTickets({
    filters: { limit: 100 },
    autoFetch: true,
  });

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = { active: 0, resolved: 0, closed: 0, cancelled: 0 };
    for (const t of tickets) {
      const status = toStatus(t.ticket_status);
      const owner = TABS.find((tb) => tb.statuses.includes(status));
      if (owner) result[owner.key] += 1;
    }
    return result;
  }, [tickets]);

  const visible = useMemo(() => {
    const statuses = TABS.find((tb) => tb.key === tab)!.statuses;
    const query = search.trim().toLowerCase();
    return tickets.filter((t: Ticket) => {
      if (!statuses.includes(toStatus(t.ticket_status))) return false;
      if (!query) return true;
      return `hd-${t.ticket_id} ${t.title} ${t.category_name ?? ""} ${t.department_name ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [tickets, tab, search]);

  const newRequestButton = (
    <Button asChild>
      <Link to="/employee/submit-request">
        <Plus data-icon="inline-start" />
        New request
      </Link>
    </Button>
  );

  const tabLabel = TABS.find((tb) => tb.key === tab)!.label.toLowerCase();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My requests"
        description="Everything you've asked IT, HR, Facilities and Finance for."
        actions={newRequestButton}
      />

      <Toolbar>
        <FilterTabs
          aria-label="Filter requests by status"
          value={tab}
          onValueChange={setTab}
          items={TABS.map((tb) => ({ value: tb.key, label: tb.label, count: loading || error ? undefined : counts[tb.key] }))}
        />
        <SearchInput
          id="search-tickets"
          value={search}
          onValueChange={setSearch}
          placeholder="Search by title or HD number"
        />
      </Toolbar>

      {error && !loading ? (
        <ErrorState title="Couldn't load your requests" onRetry={() => refetch()} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={ROW_GRID}>
            <span>Request</span>
            <span>Status</span>
            <span>Who has it</span>
            <span>Submitted</span>
            <span />
          </ListHeaderRow>

          {loading ? (
            <LoadingRows grid={ROW_GRID} columns={["title", "badge", "avatar", "meta", "blank"]} />
          ) : visible.length === 0 ? (
            tickets.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="You haven't asked for anything yet"
                description="When something breaks or you need something, start here."
                action={newRequestButton}
              />
            ) : search ? (
              <EmptyState
                icon={SearchX}
                title="Nothing matches your search"
                description="Try a different word or the HD number."
                action={
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={`No ${tabLabel} requests`}
                description="Requests show up here as they move along."
              />
            )
          ) : (
            <ListBody>
              {visible.map((t: Ticket) => (
                <ListRow key={t.ticket_id} grid={ROW_GRID} to={`/employee/tickets/${t.ticket_id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">
                      <TicketRef id={t.ticket_id} />
                      {(t.category_name || t.department_name) && <> · {t.category_name ?? t.department_name}</>}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{t.title}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:contents">
                    <div>
                      <StatusBadge status={t.ticket_status} />
                    </div>
                    <div className="hidden min-w-0 md:block">
                      <WhoHasIt ticket={t} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums md:text-sm">
                      {formatSast(t.created_at, "day")}
                    </span>
                    <ChevronRight
                      className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 md:block"
                      aria-hidden
                    />
                  </div>
                </ListRow>
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!loading && !error && tickets.length > 0 && (
        <ListCaption className="-mt-5">
          Showing {visible.length} of {tickets.length} requests
        </ListCaption>
      )}
    </div>
  );
}
