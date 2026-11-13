import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowRight, Check, CircleCheck, Clock, FileQuestion, Hourglass } from "lucide-react";
import { getTicket } from "@/services/tickets";
import type { Ticket } from "@/types/api";
import { formatSast, formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { StatusBadge } from "@/components/app/StatusBadge";
import NewRequestSteps from "@/components/request/NewRequestSteps";
import CategoryIcon from "@/components/request/CategoryIcon";
import { useApiData } from "@/components/portal/useApiData";
import { promiseTime } from "@/components/portal/portalText";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * New request, step 3: submitted (briefing p.40, S5) at /employee/tickets/:id/submitted.
 * The HD reference to quote, a summary, the steps ahead and the promise from the SLA policy:
 * "IT Support will reply by 18:14 today".
 */
export default function RequestSubmitted() {
  const { id } = useParams();
  const location = useLocation();
  const ticketId = Number(id);
  const passed = (location.state as { ticket?: Ticket } | null)?.ticket;
  const { data, error, loading, refreshing, reload } = useApiData(() => getTicket(ticketId), `ticket-${ticketId}`);
  // The form hands the new ticket over, so the page shows at once while it refreshes
  const ticket = data ?? (passed && passed.ticket_id === ticketId ? passed : null);

  if (!ticket) {
    if (loading) return <SubmittedSkeleton />;
    if (error?.isNotFound || !Number.isInteger(ticketId)) {
      return (
        <EmptyState
          variant="card"
          icon={FileQuestion}
          title="Request not found"
          description="It doesn't exist, or it isn't one of yours."
          action={
            <Button asChild>
              <Link to="/employee/my-requests">Back to my requests</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load your request" onRetry={reload} retrying={refreshing} />;
  }

  const ref = formatTicketRef(ticket.ticket_id);
  const team = ticket.department_name ?? "The team";
  const pending = ticket.ticket_status === "Pending approval";

  return (
    <div className="flex flex-col gap-8">
      <NewRequestSteps current={2} />

      <PageHeader
        title="Request submitted"
        description={
          <>
            Your reference is <span className="font-mono font-medium text-foreground">{ref}</span>. We've emailed you a copy.
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link to="/employee/my-requests">Back to my requests</Link>
            </Button>
            <Button asChild className="h-10">
              <Link to={`/employee/tickets/${ticket.ticket_id}`}>
                View request
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <SectionCard contentClassName="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CircleCheck className="size-6" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your reference</p>
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">{ref}</p>
              <p className="text-sm text-muted-foreground">Quote it on the phone or WhatsApp and we'll find your request straight away.</p>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-xl border border-border bg-muted/30 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CategoryIcon name={ticket.category_icon} className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">{ticket.title}</p>
              <p className="text-xs text-muted-foreground">
                {[ticket.category_name, team].filter(Boolean).join(" · ")}
              </p>
            </div>
            <StatusBadge status={ticket.ticket_status} className="shrink-0" />
          </div>

          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-4",
              pending ? "border-violet-200 bg-violet-50/60" : "border-primary/15 bg-primary/5",
            )}
          >
            {pending ? (
              <Hourglass className="mt-0.5 size-5 shrink-0 text-violet-700" aria-hidden />
            ) : (
              <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              {pending ? (
                <>
                  <p className="text-sm font-semibold text-foreground">Waiting for approval from the {team} lead</p>
                  <p className="text-sm text-muted-foreground">
                    Usually within 1 working day. The reply clock starts once it's approved.
                  </p>
                </>
              ) : ticket.first_response_due_at ? (
                <>
                  <p className="text-base font-semibold text-foreground">
                    {team} will reply by {promiseTime(ticket.first_response_due_at)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    That's the first-reply promise for this kind of request. Replies show up under My requests and by email.
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-foreground">{team} will reply as soon as they can.</p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="What happens now">
          <StepsAhead ticket={ticket} />
        </SectionCard>
      </div>
    </div>
  );
}

/** Vertical tracker of the steps ahead (p.40 "Stepper") */
function StepsAhead({ ticket }: { ticket: Ticket }) {
  const team = ticket.department_name ?? "the team";
  const pending = ticket.ticket_status === "Pending approval";
  const steps: { title: string; body: string; state: "done" | "current" | "next" }[] = [
    { title: "Submitted", body: formatSast(ticket.created_at), state: "done" },
    ...(pending
      ? [{ title: "Waiting for approval", body: `The ${team} lead`, state: "current" as const }]
      : []),
    {
      title: `Picked up by ${team}`,
      body: pending
        ? "First reply once it's approved"
        : ticket.first_response_due_at
          ? `First reply by ${promiseTime(ticket.first_response_due_at)}`
          : "An agent takes it on",
      state: pending ? "next" : "current",
    },
    { title: "Resolved", body: "You confirm it works", state: "next" },
  ];

  return (
    <ol aria-label="Steps ahead" className="flex flex-col">
      {steps.map((step, i) => (
        <li key={step.title} aria-current={step.state === "current" ? "step" : undefined} className="relative flex gap-3 pb-6 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2 bg-border" />
          )}
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border",
              step.state === "done" && "border-primary bg-primary text-primary-foreground",
              step.state === "current" && "border-primary bg-background text-primary ring-3 ring-primary/15",
              step.state === "next" && "border-border bg-background",
            )}
          >
            {step.state === "done" ? (
              <Check className="size-4" aria-hidden />
            ) : step.state === "current" ? (
              <span className="size-2 rounded-full bg-primary" aria-hidden />
            ) : null}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 pt-1">
            <p className={cn("text-sm font-medium", step.state === "next" ? "text-muted-foreground" : "text-foreground")}>
              {step.title}
            </p>
            <p className="text-xs text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SubmittedSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-full max-w-md" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
