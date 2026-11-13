import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Inbox, Plus, Search, Users } from "lucide-react";
import { useTickets } from "@/hooks/useTickets";
import type { Ticket } from "@/types/ticket.types";
import { toStatus, type Status } from "@/lib/ticketVocabulary";
import PageHeader from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type TabKey = "active" | "resolved" | "closed" | "cancelled";

const TABS: { key: TabKey; label: string; statuses: Status[] }[] = [
  { key: "active", label: "Active", statuses: ["new", "open", "waiting", "pending"] },
  { key: "resolved", label: "Resolved", statuses: ["resolved"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

// One grid for the header row and every ticket row, so the columns line up exactly
const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_11rem_13rem_7rem_1rem] md:items-center md:gap-6";

const formatDay = (date: string) =>
  new Date(date).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  });

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

function WhoHasIt({ ticket }: { ticket: Ticket }) {
  if (ticket.assignee_name) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
            {initials(ticket.assignee_name)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm text-foreground">{ticket.assignee_name}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
        <Users className="size-3" aria-hidden />
      </span>
      <span className="truncate text-sm">{ticket.department_name ? `${ticket.department_name} team` : "Not yet assigned"}</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className={`px-6 py-5 ${ROW_GRID}`}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="mt-3 h-5 w-24 md:mt-0" />
      <Skeleton className="hidden h-5 w-32 md:block" />
      <Skeleton className="hidden h-4 w-16 md:block" />
      <span className="hidden md:block" />
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

  // Show fetch errors once per error (calling toast during render loops forever)
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My requests"
        description="Everything you've asked IT, HR, Facilities and Finance for."
        actions={newRequestButton}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
          <TabsList>
            {TABS.map((tb) => (
              <TabsTrigger key={tb.key} value={tb.key} className="px-3">
                {tb.label}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[tb.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id="search-tickets"
            placeholder="Search by title or HD number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      {error && !loading ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load your requests</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div
            className={`hidden border-b border-border bg-muted/40 px-6 py-3 text-xs font-medium text-muted-foreground md:grid ${ROW_GRID}`}
          >
            <span>Request</span>
            <span>Status</span>
            <span>Who has it</span>
            <span>Submitted</span>
            <span />
          </div>

          {loading ? (
            <div className="divide-y divide-border">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : visible.length === 0 ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>
                  {tickets.length === 0
                    ? "You haven't asked for anything yet"
                    : search
                      ? "Nothing matches your search"
                      : `No ${TABS.find((tb) => tb.key === tab)!.label.toLowerCase()} requests`}
                </EmptyTitle>
                <EmptyDescription>
                  {tickets.length === 0
                    ? "When something breaks or you need something, start here."
                    : search
                      ? "Try a different word or the HD number."
                      : "Requests show up here as they move along."}
                </EmptyDescription>
              </EmptyHeader>
              {tickets.length === 0 && <EmptyContent>{newRequestButton}</EmptyContent>}
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((t: Ticket) => (
                <li key={t.ticket_id}>
                  <Link
                    to={`/employee/tickets/${t.ticket_id}`}
                    className={`group flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none ${ROW_GRID}`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        HD-{t.ticket_id}
                        {(t.category_name || t.department_name) && (
                          <span className="font-sans"> · {t.category_name ?? t.department_name}</span>
                        )}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{t.title}</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:contents">
                      <div>
                        <StatusBadge status={t.ticket_status} />
                      </div>
                      <div className="hidden md:block">
                        <WhoHasIt ticket={t} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground md:text-sm">
                        {formatDay(t.created_at)}
                      </span>
                      <ChevronRight
                        className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 md:block"
                        aria-hidden
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && !error && tickets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {tickets.length} requests
        </p>
      )}
    </div>
  );
}
