import { useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Play, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { listOutbox, runJobsNow } from "@/services/admin";
import type { JobsResult, OutboxMessage, OutboxStatus } from "@/types/api";
import { useApiData } from "@/hooks/useApiData";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { FilterTabs, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import OutboxStatusBadge from "@/components/admin/OutboxStatusBadge";
import { OUTBOX_STATUS } from "@/components/admin/outboxStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

type Filter = "all" | OutboxStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "SIMULATED", label: "Simulated" },
  { value: "QUEUED", label: "Queued" },
];
const PAGE_SIZE = 25;

// To · Subject · Status · Created. One grid for the header, the rows and the loading rows; stacks below lg.
const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_8.5rem_9.5rem] lg:items-center lg:gap-6";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * S9 Sent messages (briefing p.18, p.30 step 1): /system-admin/outbox. Every email the helpdesk
 * sent, failed to send or simulated (no SMTP set up), newest first, and "Run jobs now": breach
 * alerts, the 5-day auto-close with its CSAT survey, and the queued emails.
 */
export default function SentMessages() {
  const [filter, setFilter] = useState<Filter>("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<JobsResult | null>(null);

  const params = { status: filter === "all" ? undefined : filter, date: date || undefined, page, limit: PAGE_SIZE };
  const outbox = useApiData(() => listOutbox(params), `outbox-${filter}-${date}-${page}`);

  const counts = outbox.data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const messages = outbox.data?.messages ?? [];
  const pagination = outbox.data?.pagination;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const runJobs = async () => {
    setRunning(true);
    try {
      const { result } = await runJobsNow();
      setLastRun(result);
      toast.success("Jobs ran", { description: jobsSummary(result) });
      outbox.reload();
    } catch (err) {
      toast.error("Couldn't run the jobs", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sent messages"
        description="Every email the helpdesk sent, failed to send or simulated, newest first"
        actions={
          <Button onClick={() => void runJobs()} disabled={running} className="h-10 sm:h-9">
            {running ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            Run jobs now
          </Button>
        }
      />

      {lastRun && (
        <Alert className="flex flex-col gap-1 rounded-xl border-primary/20 bg-accent px-5 py-4">
          <AlertTitle className="flex items-center gap-2 font-semibold text-foreground">
            <Play className="size-4 text-primary" aria-hidden />
            Jobs ran at {formatSast(lastRun.ran_at, "time")}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground tabular-nums">{jobsSummary(lastRun)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <Toolbar>
          <FilterTabs
            aria-label="Messages by status"
            value={filter}
            onValueChange={changeFilter}
            items={FILTERS.map((f) => ({ ...f, count: f.value === "all" ? total : counts?.[f.value] }))}
          />
          <InputGroup className="h-10 w-full sm:h-9 sm:w-52">
            <InputGroupAddon>
              <span className="text-xs text-muted-foreground">Day</span>
            </InputGroupAddon>
            <InputGroupInput
              type="date"
              aria-label="Show messages from one day"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
            {date && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Show every day" onClick={() => setDate("")}>
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </Toolbar>

        {outbox.error && !outbox.data ? (
          <ErrorState
            title="Couldn't load sent messages"
            description={outbox.error.status === 0 ? undefined : outbox.error.message}
            onRetry={outbox.reload}
          />
        ) : (
          <ListCard>
            <ListHeaderRow grid={ROW_GRID}>
              <span>To</span>
              <span>Subject</span>
              <span>Status</span>
              <span>Created</span>
            </ListHeaderRow>
            {outbox.loading ? (
              <LoadingRows grid={ROW_GRID} breakpoint="lg" rows={6} columns={["person", "title", "badge", "meta"]} />
            ) : messages.length === 0 ? (
              filter === "all" && !date ? (
                <EmptyState
                  icon={Inbox}
                  title="No messages yet"
                  description="Replies, assignments, approvals and breach alerts are emailed from here. Run jobs now to send what's queued."
                />
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={`No ${filter === "all" ? "" : `${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} `}messages${date ? " that day" : ""}`}
                  description="Try another status or day."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        changeFilter("all");
                        setDate("");
                      }}
                    >
                      Show everything
                    </Button>
                  }
                />
              )
            ) : (
              <ListBody className={cn(outbox.refreshing && "opacity-60 transition-opacity")}>
                {messages.map((m) => (
                  <MessageRow key={m.id} message={m} />
                ))}
              </ListBody>
            )}
          </ListCard>
        )}

        {pagination && messages.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ListCaption>
              {plural(pagination.total, "message")} · bodies aren&apos;t shown here. Run jobs now also retries failed emails.
            </ListCaption>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function jobsSummary(r: JobsResult): string {
  const emails = [
    r.emails.sent > 0 && `${r.emails.sent} sent`,
    r.emails.failed > 0 && `${r.emails.failed} failed`,
    r.emails.simulated > 0 && `${r.emails.simulated} simulated`,
  ].filter(Boolean);
  return [
    r.breach_alerts > 0 ? plural(r.breach_alerts, "breach alert") : "No new breach alerts",
    r.closed > 0 ? `${plural(r.closed, "ticket")} auto-closed` : "nothing to auto-close",
    emails.length ? `emails: ${emails.join(", ")}` : "no emails waiting",
  ].join(" · ");
}

function MessageRow({ message: m }: { message: OutboxMessage }) {
  return (
    <ListRow grid={ROW_GRID} className="py-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <UserAvatar name={m.recipient_name || m.recipient} description={m.recipient} />
        <span className="lg:hidden">
          <OutboxStatusBadge status={m.status} />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-sm text-foreground [overflow-wrap:anywhere]">{m.subject}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {m.ticket_id && (
            <>
              <TicketRef id={m.ticket_id} />
              <span aria-hidden>·</span>
            </>
          )}
          <span className="capitalize">{m.channel}</span>
          <span className="lg:hidden tabular-nums">· {formatSast(m.created_at)}</span>
        </p>
        {m.status === "FAILED" && m.error && (
          <p className="line-clamp-2 text-xs text-destructive [overflow-wrap:anywhere]">{m.error}</p>
        )}
      </div>
      <span className="hidden lg:block">
        <OutboxStatusBadge status={m.status} />
      </span>
      <div className="hidden flex-col gap-0.5 text-sm tabular-nums lg:flex">
        <span className="text-foreground">{formatSast(m.created_at)}</span>
        <span className="text-xs text-muted-foreground">
          {m.sent_at ? `Sent ${formatSast(m.sent_at, "time")}` : OUTBOX_STATUS[m.status]?.hint.split(",")[0]}
        </span>
      </div>
    </ListRow>
  );
}
