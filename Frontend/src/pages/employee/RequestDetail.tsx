import { useMemo, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FileQuestion, Lock, MessageSquareText, Plus, Sparkles } from "lucide-react";
import {
  deleteComment,
  editComment,
  getTicket,
  getTicketActions,
  getTimeline,
  sendComment,
  transitionTicket,
} from "@/services/tickets";
import { listCategories } from "@/services/categories";
import { toApiError } from "@/services/apiClient";
import type { Ticket, TicketStatus } from "@/types/api";
import { firstNameOf, formatSast } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import KeyValueList, { type KeyValueItem } from "@/components/app/KeyValueList";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { useApiData } from "@/hooks/useApiData";
import RequestProgress from "@/components/portal/RequestProgress";
import TicketTimeline from "@/components/tickets/TicketTimeline";
import ReplyComposer from "@/components/portal/ReplyComposer";
import ResolvedCheck from "@/components/portal/ResolvedCheck";
import CancelRequestButton from "@/components/portal/CancelRequestButton";
import ApprovalBanner from "@/components/portal/ApprovalBanner";
import { RequestFilesCard, WhoCanSeeFiles } from "@/components/portal/RequestFiles";
import { filesOf } from "@/components/portal/fileList";
import { CsatPrompt, RatingCard } from "@/components/feedback/CsatPrompt";
import { useDepartmentLead } from "@/components/request/useDepartmentLead";
import { IMPACT_LABEL, nextDueAt, promiseTime } from "@/components/portal/portalText";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REOPEN_DAYS = 5;

/** "Thabo Nkosi from IT Support is working on this", in plain words (p.41 header) */
function WhoHasIt({
  ticket,
  approverName,
  declinedBy,
}: {
  ticket: Ticket;
  approverName: string | null;
  /** Cancelled by an approval rejection: the lead's name */
  declinedBy: string | null;
}) {
  const team = ticket.department_name ?? "the team";
  const person = ticket.assignee_name;
  // The avatar stays beside the sentence at 390px; the words wrap next to it
  const withPerson = (text: ReactNode) => (
    <span className="mt-1 flex items-start gap-2">
      <UserAvatar name={person} size="sm" className="mt-px shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{person}</span> from {team} {text}
      </span>
    </span>
  );

  switch (ticket.ticket_status) {
    case "Pending approval":
      return approverName ? (
        <>
          Waiting for <span className="font-medium text-foreground">{approverName}</span>'s approval.
        </>
      ) : (
        <>Waiting for approval from the {team} lead.</>
      );
    case "New":
      return person ? withPerson("will pick this up") : <>Waiting for someone in {team} to pick this up.</>;
    case "Open":
      return person ? withPerson("is working on this") : <>{team} is working on this.</>;
    case "Waiting on employee":
      return person ? withPerson("is waiting for your reply") : <>{team} is waiting for your reply.</>;
    case "Resolved":
      return person ? withPerson("resolved this") : <>{team} resolved this.</>;
    case "Closed":
      return person ? withPerson("handled this") : <>This request is closed.</>;
    default:
      return declinedBy ? (
        <>
          Declined by <span className="font-medium text-foreground">{declinedBy}</span>. The reason is below.
        </>
      ) : (
        <>This request was cancelled.</>
      );
  }
}

function detailItems(ticket: Ticket, reopenUntil: string | null): KeyValueItem[] {
  const items: KeyValueItem[] = [
    { label: "Reference", value: <TicketRef id={ticket.ticket_id} className="text-sm text-foreground" /> },
    { label: "Category", value: <span className="truncate">{ticket.category_name ?? "—"}</span> },
    { label: "Team", value: ticket.department_name ?? "—" },
    { label: "Priority", value: <PriorityBadge priority={ticket.ticket_priority} /> },
  ];
  if (ticket.impact) items.push({ label: "Impact", value: IMPACT_LABEL[ticket.impact] });
  items.push({ label: "Submitted", value: formatSast(ticket.created_at) });

  const status: TicketStatus = ticket.ticket_status;
  if (status === "Pending approval") {
    items.push({ label: "Next update by", value: <span className="text-muted-foreground">After approval</span> });
  } else if (status === "Waiting on employee") {
    items.push({ label: "Next update by", value: <span className="text-muted-foreground">After you reply</span> });
  } else if (status === "New" || status === "Open") {
    // The portal's promise words (p.37, p.41), never the staff SLA chip ("Breached 6h")
    const due = nextDueAt(ticket);
    const late = due !== null && new Date(due).getTime() < Date.now();
    items.push({
      label: "Next update by",
      value: !due ? (
        <span className="text-muted-foreground">Soon</span>
      ) : late ? (
        <span className="font-medium text-destructive">Running late · was due {promiseTime(due)}</span>
      ) : (
        promiseTime(due)
      ),
    });
  } else if (status === "Resolved") {
    items.push({ label: "Resolved", value: formatSast(ticket.resolved_at) });
    const closes =
      reopenUntil ?? (ticket.resolved_at ? new Date(new Date(ticket.resolved_at).getTime() + REOPEN_DAYS * 86_400_000).toISOString() : null);
    if (closes) items.push({ label: "Closes on its own", value: formatSast(closes, "day") });
  } else if (status === "Closed") {
    items.push({ label: "Closed", value: formatSast(ticket.closed_at ?? ticket.updated_at) });
  } else {
    items.push({ label: "Cancelled", value: formatSast(ticket.updated_at) });
  }
  if (ticket.reopen_count > 0) {
    items.push({ label: "Reopened", value: ticket.reopen_count === 1 ? "Once" : `${ticket.reopen_count} times` });
  }
  return items;
}

/**
 * Request detail, the employee view (briefing p.41, p.45; S2, S4) at /employee/tickets/:id:
 * who has it in plain words, a five-step progress bar, the PUBLIC timeline, the reply box and
 * the actions GET /actions allows (Cancel, Yes it's fixed, Still broken).
 */
export default function RequestDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const ticketId = Number(id);
  const valid = Number.isInteger(ticketId) && ticketId > 0;

  const { user } = useAuth();
  const userId = String(user?.user_id ?? user?.id ?? "");
  const ticketQ = useApiData(() => getTicket(ticketId), `ticket-${ticketId}`);
  const timelineQ = useApiData(() => getTimeline(ticketId), `timeline-${ticketId}`);
  const actionsQ = useApiData(() => getTicketActions(ticketId), `actions-${ticketId}`);
  const categoriesQ = useApiData(() => listCategories(), "categories");

  // The category's questions label the answers; a category switched off since falls back to the keys
  const fields = useMemo(
    () => categoriesQ.data?.categories.find((c) => c.category_id === ticketQ.data?.ticket_category_id)?.fields ?? [],
    [categoriesQ.data, ticketQ.data?.ticket_category_id],
  );

  const ticket = ticketQ.data;
  const actions = actionsQ.data?.actions ?? [];
  const approverName = useDepartmentLead(ticket?.ticket_department_id);
  const files = useMemo(() => filesOf(timelineQ.data?.items ?? null), [timelineQ.data]);
  const declinedBy = useMemo(() => {
    const rejected = timelineQ.data?.items.findLast((item) => item.kind === "event" && item.type === "rejected");
    return rejected ? (rejected.actor?.name ?? approverName ?? "the lead") : null;
  }, [timelineQ.data, approverName]);

  const refreshAll = () => {
    ticketQ.reload();
    timelineQ.reload();
    actionsQ.reload();
  };

  /** Shows the server's reason; on 409 (the state moved on) the page reloads to show why */
  const fail = (title: string, error: unknown) => {
    const apiError = toApiError(error);
    toast.error(title, { description: apiError.message });
    if (apiError.isConflict) refreshAll();
  };

  const sendReply = async (body: string, attachmentIds: number[]) => {
    try {
      await sendComment(ticketId, { body, attachment_ids: attachmentIds.length ? attachmentIds : undefined });
      toast.success(attachmentIds.length ? `Reply sent with ${attachmentIds.length} ${attachmentIds.length === 1 ? "file" : "files"}` : "Reply sent");
      refreshAll();
      return true;
    } catch (error) {
      fail("Couldn't send your reply", error);
      return false;
    }
  };

  const move = async (to: TicketStatus, success: string, note?: string) => {
    try {
      const updated = await transitionTicket(ticketId, { to, note: note || undefined });
      ticketQ.setData(updated);
      timelineQ.reload();
      actionsQ.reload();
      toast.success(success);
      return true;
    } catch (error) {
      fail("Couldn't update your request", error);
      return false;
    }
  };

  const saveEdit = async (commentId: number, body: string) => {
    try {
      await editComment(commentId, body);
      timelineQ.reload();
      toast.success("Message updated");
      return true;
    } catch (error) {
      fail("Couldn't edit the message", error);
      return false;
    }
  };

  const remove = async (commentId: number) => {
    try {
      await deleteComment(commentId);
      timelineQ.reload();
      toast.success("Message deleted");
    } catch (error) {
      fail("Couldn't delete the message", error);
    }
  };

  if (!valid || ticketQ.error?.isNotFound) {
    return (
      <EmptyState
        variant="card"
        icon={FileQuestion}
        title="Request not found"
        description="It doesn't exist, or it isn't one of yours. Check the HD number and try again."
        action={
          <Button asChild>
            <Link to="/employee/my-requests">Back to my requests</Link>
          </Button>
        }
      />
    );
  }
  if (ticketQ.loading) return <DetailSkeleton />;
  if (!ticket) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader back={{ to: "/employee/my-requests", label: "My requests" }} title="Request" />
        <ErrorState title="Couldn't load this request" onRetry={ticketQ.reload} retrying={ticketQ.refreshing} />
      </div>
    );
  }

  const status = ticket.ticket_status;
  const canReply = actions.includes("reply");
  const canCancel = actions.includes("cancel");
  const finished = status === "Closed" || status === "Cancelled";
  const assigneeFirst = ticket.assignee_name ? firstNameOf(ticket.assignee_name) : null;

  const timeline = (
    <TicketTimeline
      ticket={ticket}
      items={timelineQ.data?.items ?? null}
      audience="requester"
      error={!timelineQ.loading && !timelineQ.data ? (timelineQ.error?.message ?? "Something went wrong.") : null}
      onRetry={timelineQ.reload}
      retrying={timelineQ.refreshing}
      userId={userId}
      fields={fields}
      onSaveEdit={saveEdit}
      onDelete={remove}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        back={{ to: "/employee/my-requests", label: "My requests" }}
        eyebrow={
          <>
            <TicketRef id={ticket.ticket_id} />
            <StatusBadge status={status} />
          </>
        }
        title={ticket.title}
        description={<WhoHasIt ticket={ticket} approverName={approverName} declinedBy={declinedBy} />}
      />

      <RequestProgress ticket={ticket} />

      <ApprovalBanner ticket={ticket} items={timelineQ.data?.items ?? null} approverName={approverName} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {status === "Resolved" && (
            <ResolvedCheck
              ticket={ticket}
              canConfirm={actions.includes("confirm_fixed")}
              canReopen={actions.includes("still_broken")}
              reopenUntil={actionsQ.data?.reopen_until ?? null}
              onConfirm={() => move("Closed", "Thanks! Your request is closed.")}
              onReopen={(note) => move("Open", "Reopened. The team will pick it up again.", note)}
            />
          )}

          {status === "Closed" && !ticket.feedback && <CsatPrompt ticket={ticket} />}

          <section aria-label="Timeline" className="flex flex-col gap-3">
            {timeline}
          </section>

          {canReply ? (
            <ReplyComposer
              ticketId={ticket.ticket_id}
              replyTo={assigneeFirst}
              waiting={status === "Waiting on employee"}
              focusOnMount={params.has("reply")}
              onSend={sendReply}
            />
          ) : (
            finished && (
              <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  This request is {status.toLowerCase()}, so replies are off. Need more help? Start a new request.
                </p>
                <Button asChild variant="outline" className="h-10 shrink-0">
                  <Link to="/employee/submit-request">
                    <Plus data-icon="inline-start" />
                    New request
                  </Link>
                </Button>
              </div>
            )
          )}
        </div>

        <aside aria-label="About this request" className="flex flex-col gap-6 lg:sticky lg:top-24">
          <SectionCard title="Details">
            <KeyValueList items={detailItems(ticket, actionsQ.data?.reopen_until ?? null)} />
          </SectionCard>

          {ticket.feedback && <RatingCard feedback={ticket.feedback} />}

          <RequestFilesCard files={files} loading={timelineQ.loading} />
          {(canReply || files.length > 0) && <WhoCanSeeFiles team={ticket.department_name} />}

          {actionsQ.error && !actionsQ.data ? (
            <ErrorState
              stacked
              title="Couldn't load your options"
              description="Replying and cancelling may be missing."
              onRetry={actionsQ.reload}
              retrying={actionsQ.refreshing}
            />
          ) : (
            <>
              {(status === "New" || status === "Pending approval") && (
                <SideNote
                  icon={MessageSquareText}
                  title="Need to change something?"
                  body="Add details as a reply. You can cancel while a request is new or waiting for approval."
                >
                  {canCancel && (
                    <CancelRequestButton
                      ticketId={ticket.ticket_id}
                      onCancel={() => move("Cancelled", "Request cancelled")}
                    />
                  )}
                </SideNote>
              )}
              {(status === "Open" || status === "Waiting on employee") && (
                <SideNote
                  tone="primary"
                  icon={Sparkles}
                  title={`When ${assigneeFirst ?? "the team"} resolves it`}
                  body={`You'll get two buttons here: Yes, it's fixed or Still broken (for ${REOPEN_DAYS} days).`}
                />
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function SideNote({
  icon: Icon,
  title,
  body,
  tone = "default",
  children,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
  tone?: "default" | "primary";
  children?: ReactNode;
}) {
  return (
    <Card
      className={
        tone === "primary"
          ? "gap-4 border border-primary/15 bg-primary/5 shadow-none ring-0 [--card-spacing:--spacing(6)]"
          : "gap-4 border border-border shadow-none ring-0 [--card-spacing:--spacing(6)]"
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription className="text-sm">{body}</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the timeline">
      <Skeleton className="h-4 w-2/3" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-1.5 w-full" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TimelineSkeleton />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
