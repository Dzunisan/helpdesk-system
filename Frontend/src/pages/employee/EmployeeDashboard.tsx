import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Inbox, Plus, SearchX, Users } from "lucide-react";
import { listTickets } from "@/services/tickets";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Ticket } from "@/types/api";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { useApiData } from "@/components/portal/useApiData";
import WaitingCallout from "@/components/portal/WaitingCallout";
import {
  REQUEST_TABS,
  isRequestTab,
  nextPromise,
  type PromiseTone,
  type RequestTab,
} from "@/components/portal/portalText";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// One grid for the header row, every request row and the loading rows, so the columns line up exactly
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_10rem_12rem_16rem_1rem] md:items-center md:gap-6";

const TONE: Record<PromiseTone, string> = {
  muted: "text-muted-foreground",
  waiting: "font-medium text-amber-700",
  late: "font-medium text-destructive",
  action: "font-medium text-primary",
};

const byTab = (ticket: Ticket, tab: RequestTab) =>
  REQUEST_TABS.find((t) => t.key === tab)!.statuses.includes(ticket.ticket_status);

const newest = (a: Ticket, b: Ticket) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

/** Requests waiting on the employee first, then the most recently updated */
const activeOrder = (a: Ticket, b: Ticket) => {
  const aw = a.ticket_status === "Waiting on employee" ? 0 : 1;
  const bw = b.ticket_status === "Waiting on employee" ? 0 : 1;
  return aw - bw || newest(a, b);
};

function WhoHasIt({ ticket }: { ticket: Ticket }) {
  if (ticket.assignee_name) return <UserAvatar name={ticket.assignee_name} size="sm" showName />;
  const team = ticket.department_name ?? "The team";
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      <span className="truncate text-sm">
        {ticket.ticket_status === "Pending approval" ? `${team} lead` : `${team} team`}
      </span>
    </div>
  );
}

/**
 * My requests, the portal home (briefing p.37, p.45): the amber "Waiting on you" callout,
 * tabs Active / Waiting on you / Resolved / Closed / Cancelled with counts, and one row per
 * request with who has it and the next promise ("Update expected by 16:14 today").
 * Phones: cards, filter chips and a sticky full-width New request button.
 */
export default function EmployeeDashboard() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: RequestTab = isRequestTab(tabParam) ? tabParam : "active";
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const { data, error, loading, refreshing, reload } = useApiData(() => listTickets({ limit: 100 }), "my-requests");
  const tickets = useMemo(() => data?.tickets ?? [], [data]);

  const setTab = (next: RequestTab) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "active") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      },
      { replace: true },
    );

  const counts = useMemo(() => {
    const result = Object.fromEntries(REQUEST_TABS.map((t) => [t.key, 0])) as Record<RequestTab, number>;
    for (const ticket of tickets) for (const t of REQUEST_TABS) if (byTab(ticket, t.key)) result[t.key] += 1;
    return result;
  }, [tickets]);

  const waiting = useMemo(
    () => tickets.filter((t) => t.ticket_status === "Waiting on employee").sort(newest),
    [tickets],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets
      .filter((t) => byTab(t, tab))
      .filter(
        (t) =>
          !query ||
          `hd-${t.ticket_id} ${t.title} ${t.category_name ?? ""} ${t.department_name ?? ""}`.toLowerCase().includes(query),
      )
      .sort(tab === "active" ? activeOrder : newest);
  }, [tickets, tab, search]);

  const newRequestButton = (
    <Button asChild>
      <Link to="/employee/submit-request">
        <Plus data-icon="inline-start" />
        New request
      </Link>
    </Button>
  );

  const ready = !loading && !(error && !data);
  const tabLabel = REQUEST_TABS.find((t) => t.key === tab)!.label.toLowerCase();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My requests"
        description="Everything you've asked IT, HR, Facilities and Finance for."
        actions={isMobile ? undefined : newRequestButton}
      />

      {ready && waiting.length > 0 && (
        <WaitingCallout ticket={waiting[0]} total={waiting.length} onShowAll={() => setTab("waiting")} />
      )}

      <div className="flex flex-col gap-4">
        <Toolbar>
          <FilterTabs
            aria-label="Filter requests by status"
            value={tab}
            onValueChange={setTab}
            className="hidden sm:flex"
            items={REQUEST_TABS.map((t) => ({ value: t.key, label: t.label, count: ready ? counts[t.key] : undefined }))}
          />
          {/* Phones: filter chips instead of tabs (p.45) */}
          <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={tab}
              onValueChange={(value) => value && setTab(value as RequestTab)}
              aria-label="Filter requests by status"
              className="w-max"
            >
              {REQUEST_TABS.map((t) => (
                <ToggleGroupItem
                  key={t.key}
                  value={t.key}
                  className={cn(
                    "h-9 rounded-full! px-3.5 data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background",
                    t.key === "waiting" && counts.waiting > 0 && "border-amber-300 bg-amber-50 text-amber-800",
                  )}
                >
                  {t.label}
                  {ready && <span className="tabular-nums opacity-70">{counts[t.key]}</span>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <SearchInput
            id="search-requests"
            value={search}
            onValueChange={setSearch}
            placeholder="Search by title or HD number"
          />
        </Toolbar>

        {error && !data ? (
          <ErrorState title="Couldn't load your requests" onRetry={reload} retrying={refreshing} />
        ) : (
          <ListCard>
            <ListHeaderRow grid={ROW_GRID}>
              <span>Request</span>
              <span>Status</span>
              <span>Who has it</span>
              <span className="text-right">Next</span>
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
                  title={tab === "waiting" ? "Nobody is waiting on you" : `No ${tabLabel} requests`}
                  description={
                    tab === "waiting"
                      ? "When the team asks you a question, it shows up here."
                      : "Requests show up here as they move along."
                  }
                />
              )
            ) : (
              <ListBody>
                {visible.map((t) => {
                  const promise = nextPromise(t);
                  return (
                    <ListRow key={t.ticket_id} grid={ROW_GRID} to={`/employee/tickets/${t.ticket_id}`}>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-xs text-muted-foreground">
                            <TicketRef id={t.ticket_id} />
                            {t.category_name && <> · {t.category_name}</>}
                          </p>
                          <StatusBadge status={t.ticket_status} className="md:hidden" />
                        </div>
                        <p className="line-clamp-2 text-sm font-medium text-foreground md:truncate">{t.title}</p>
                      </div>
                      <div className="hidden md:block">
                        <StatusBadge status={t.ticket_status} />
                      </div>
                      <div className="hidden min-w-0 md:block">
                        <WhoHasIt ticket={t} />
                      </div>
                      <p className={cn("text-xs md:truncate md:text-right md:text-sm", TONE[promise.tone])}>{promise.text}</p>
                      <ChevronRight
                        className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 md:block"
                        aria-hidden
                      />
                    </ListRow>
                  );
                })}
              </ListBody>
            )}
          </ListCard>
        )}

        {ready && tickets.length > 0 && (
          <ListCaption>
            Showing {visible.length} of {tickets.length} requests
          </ListCaption>
        )}
      </div>

      {/* Phones: a sticky full-width New request button instead of the header one (p.45) */}
      {isMobile && (
        <div className="sticky bottom-4 z-10 -mt-4">
          <Button asChild size="lg" className="h-12 w-full shadow-lg">
            <Link to="/employee/submit-request">
              <Plus data-icon="inline-start" />
              New request
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
