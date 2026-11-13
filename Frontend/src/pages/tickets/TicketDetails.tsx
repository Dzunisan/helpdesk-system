import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, LifeBuoy, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  addTicketComment,
  approveTicket,
  assignTicket,
  deleteComment,
  fetchAgents,
  fetchTicketById,
  fetchTicketComments,
  rejectTicket,
  submitTicketFeedback,
  updateComment,
  updateTicketStatus,
} from "@/services/ticketService";
import type { AgentUser, Ticket, TicketComment, TicketFeedback } from "@/types/ticket.types";
import { statusLabel } from "@/lib/ticketVocabulary";
import { formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import ErrorState from "@/components/app/ErrorState";
import SectionCard from "@/components/app/SectionCard";
import ReasonDialog from "@/components/app/ReasonDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TicketHeader from "@/components/tickets/TicketHeader";
import TicketActionBar from "@/components/tickets/TicketActionBar";
import StatusTracker from "@/components/tickets/StatusTracker";
import TicketConversation from "@/components/tickets/TicketConversation";
import TicketComposer from "@/components/tickets/TicketComposer";
import TicketPropertiesPanel, { RequesterCard } from "@/components/tickets/TicketPropertiesPanel";
import { FeedbackAwaiting, FeedbackForm, FeedbackSummary } from "@/components/tickets/TicketFeedback";
import TicketDetailSkeleton from "@/components/tickets/TicketDetailSkeleton";
import { TICKET_ASIDE, TICKET_GRID, asideTop } from "@/components/tickets/layout";
import { useNavHighlight } from "@/components/app/navHighlight";
import NotFoundPanel from "@/components/auth/NotFoundPanel";
import { backLinkFor, displayStatus, firstName, normalizeRole, permissionsFor } from "@/components/tickets/ticketDetail";
import StaffTicketView from "@/components/tickets/StaffTicketView";

const errorMessage = (err: unknown, fallback: string) =>
  (err as { message?: string } | null)?.message || fallback;

type LoadResult =
  | { kind: "ok"; ticket: Ticket; comments: TicketComment[]; agents: AgentUser[] }
  | { kind: "notFound" }
  | { kind: "error" };

/** Ticket + comments, plus the department's agents when the viewer may reassign */
async function loadTicket(id: string | undefined, withAgents: boolean): Promise<LoadResult> {
  const ticketId = Number(id);
  if (!id || !Number.isInteger(ticketId)) return { kind: "notFound" };
  try {
    const ticket = await fetchTicketById(ticketId);
    const comments = await fetchTicketComments(ticketId);
    let agents: AgentUser[] = [];
    if (withAgents) {
      try {
        agents = await fetchAgents(ticket.ticket_department_id ?? undefined);
      } catch (err) {
        console.warn("Could not load agents list:", err);
      }
    }
    return { kind: "ok", ticket, comments, agents };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && [400, 403, 404].includes(statusCode)) return { kind: "notFound" };
    console.error("Failed to load ticket:", err);
    return { kind: "error" };
  }
}

/**
 * Ticket detail. Agents and leads get the three-pane inbox (briefing p.48-49, S2-S4:
 * components/tickets/StaffTicketView); employees keep the request view below (p.41) until
 * pages/employee/RequestDetail.tsx is rebuilt on GET /timeline and GET /actions.
 */
export default function TicketDetails() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  if (role === "Agent" || role === "Department Lead") return <StaffTicketView />;
  return <EmployeeTicketDetails />;
}

/** The employee's view of their own request (briefing p.41) */
function EmployeeTicketDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  // 404 and 403 look the same on purpose: it never reveals that a ticket exists (briefing p.69)
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [feedback, setFeedback] = useState<TicketFeedback | null>(null);
  const [agents, setAgents] = useState<AgentUser[]>([]);

  // One action at a time; `pendingAction` says which button shows the spinner
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // Dialogs that replace window.confirm / window.prompt (briefing p.34 #4)
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);

  const permissions = useMemo(() => permissionsFor(user, ticket), [user, ticket]);
  const { canReassign, canSeeInternal } = permissions;

  // Load ticket, comments and (for leads) the agents they can reassign to
  const applyLoad = useCallback((result: LoadResult) => {
    if (result.kind === "ok") {
      setTicket(result.ticket);
      setNotFound(false);
      setFeedback(result.ticket.feedback ?? null);
      setComments(result.comments);
      setAgents(result.agents);
    } else if (result.kind === "notFound") {
      setNotFound(true);
    }
    // "error" is shown as an ErrorState with "Try again"; no toast on top of it
    setLoading(false);
    setRetrying(false);
  }, []);

  useEffect(() => {
    let active = true;
    loadTicket(id, canReassign).then((result) => active && applyLoad(result));
    return () => {
      active = false;
    };
  }, [id, canReassign, applyLoad]);

  const retryLoad = () => {
    setRetrying(true);
    void loadTicket(id, canReassign).then(applyLoad);
  };

  const reloadComments = async (ticketId: number) => {
    try {
      setComments(await fetchTicketComments(ticketId));
    } catch (err) {
      console.warn("Could not refresh comments:", err);
    }
  };

  // Wraps an action: one at a time, with the spinner on the button that started it
  const runAction = async (key: string, work: () => Promise<void>) => {
    if (!ticket || actionLoading) return;
    setActionLoading(true);
    setPendingAction(key);
    try {
      await work();
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  const handleAddComment = async (body: string, internal: boolean): Promise<boolean> => {
    if (!ticket) return false;
    try {
      const created = await addTicketComment(ticket.ticket_id, body, permissions.canAddInternal ? internal : false);
      setComments((prev) => [...prev, created]);
      toast.success(created.is_internal ? "Internal note added" : "Reply sent");
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't post your comment"));
      return false;
    }
  };

  const handleSaveEdit = async (commentId: number, body: string): Promise<boolean> => {
    try {
      const updated = await updateComment(commentId, body);
      setComments((prev) =>
        prev.map((c) => (c.comment_id === commentId ? { ...c, body: updated.body, updated_at: updated.updated_at } : c)),
      );
      toast.success("Comment updated");
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save your edit"));
      return false;
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    setDeleteCommentId(null);
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.comment_id !== commentId));
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the comment"));
    }
  };

  const handleSubmitFeedback = async (rating: number, comment: string): Promise<boolean> => {
    if (!ticket) return false;
    if (rating < 1 || rating > 5) {
      toast.error("Choose between 1 and 5 stars.");
      return false;
    }
    try {
      const submitted = await submitTicketFeedback(ticket.ticket_id, rating, comment || undefined);
      setFeedback(submitted);
      toast.success("Thanks for rating this request");
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send your rating"));
      return false;
    }
  };

  const handleStatusChange = (newStatus: string) =>
    runAction(newStatus, async () => {
      if (!ticket || newStatus === ticket.ticket_status) return;
      try {
        const updated = await updateTicketStatus(ticket.ticket_id, newStatus);
        setTicket((prev) =>
          prev ? { ...prev, ticket_status: updated.ticket_status, updated_at: updated.updated_at ?? prev.updated_at } : null,
        );
        toast.success(
          newStatus === "Cancelled" && !permissions.isStaff ? "Request cancelled" : `Status changed to ${statusLabel(newStatus)}`,
        );
        await reloadComments(ticket.ticket_id);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't change the status"));
      }
    });

  const handleApprove = (note: string) => {
    setApproveOpen(false);
    return runAction("approve", async () => {
      if (!ticket) return;
      try {
        const updated = await approveTicket(ticket.ticket_id, note || undefined);
        setTicket((prev) => (prev ? { ...prev, ticket_status: updated.ticket_status } : null));
        toast.success(`${formatTicketRef(ticket.ticket_id)} approved`);
        await reloadComments(ticket.ticket_id);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't approve the request"));
      }
    });
  };

  const handleReject = (reason: string) => {
    setRejectOpen(false);
    return runAction("reject", async () => {
      if (!ticket) return;
      try {
        const updated = await rejectTicket(ticket.ticket_id, reason || undefined);
        setTicket((prev) => (prev ? { ...prev, ticket_status: updated.ticket_status } : null));
        toast.success(`${formatTicketRef(ticket.ticket_id)} rejected`);
        await reloadComments(ticket.ticket_id);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't reject the request"));
      }
    });
  };

  // Assign to me: the server also moves the status on (New -> Open)
  const applyAssignment = (updated: Ticket) =>
    setTicket((prev) =>
      prev
        ? {
            ...prev,
            assignee_id: updated.assignee_id,
            assignee_name: updated.assignee_name,
            assignee_email: updated.assignee_email,
            ticket_status: updated.ticket_status,
          }
        : null,
    );

  const handleAssignToMe = () =>
    runAction("assign", async () => {
      if (!ticket) return;
      try {
        applyAssignment(await assignTicket(ticket.ticket_id));
        toast.success("Assigned to you");
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't assign the ticket"));
      }
    });

  const handleReassign = (newAssigneeId: string) => {
    if (!newAssigneeId || newAssigneeId === String(ticket?.assignee_id ?? "")) return;
    return runAction("reassign", async () => {
      if (!ticket) return;
      try {
        const updated = await assignTicket(ticket.ticket_id, newAssigneeId);
        applyAssignment(updated);
        toast.success(`Reassigned to ${updated.assignee_name || "the selected agent"}`);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't reassign the ticket"));
      }
    });
  };

  // Employees only see public comments; staff see everything
  const visibleComments = useMemo(
    () => comments.filter((c) => !c.is_internal || canSeeInternal),
    [comments, canSeeInternal],
  );

  const back = backLinkFor(permissions.role, ticket, permissions.userId);
  // Light up the list this ticket belongs to in the sidebar (My open, Unassigned, Approvals…)
  useNavHighlight(back.to);

  if (loading) return <TicketDetailSkeleton staff={permissions.isStaff} />;

  if (!ticket) {
    if (notFound) {
      // 404 and 403 read the same, so the page never admits the ticket exists (briefing p.69)
      const reference = /^\d+$/.test(id ?? "") ? formatTicketRef(id!) : "This ticket";
      return (
        <section
          aria-labelledby="ticket-not-found-title"
          className="flex min-h-[min(32rem,calc(100svh-14rem))] items-center justify-center rounded-xl border border-border bg-background px-6 py-16"
        >
          <NotFoundPanel
            icon={SearchX}
            title={<span id="ticket-not-found-title">Ticket not found</span>}
            description={`${reference} doesn't exist or isn't in your department. If someone sent you this link, ask them to check the reference.`}
            actions={
              <Button asChild variant="outline">
                <Link to={back.to}>
                  <ChevronLeft data-icon="inline-start" />
                  Back to {back.label.toLowerCase() === "home" ? "home" : back.label}
                </Link>
              </Button>
            }
          />
        </section>
      );
    }
    return (
      <div className="flex flex-col gap-8">
        <PageHeader back={back} title={/^\d+$/.test(id ?? "") ? formatTicketRef(id!) : "Ticket"} />
        <ErrorState
          title="Couldn't load this ticket"
          onRetry={retryLoad}
          retrying={retrying}
        />
      </div>
    );
  }

  const status = displayStatus(ticket);
  const isDone = status === "resolved" || status === "closed";
  const showFeedbackForm = isDone && !feedback && permissions.isRequester;
  const isEmployeeView = !permissions.isStaff;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <TicketHeader
          ticket={ticket}
          permissions={permissions}
          back={back}
          actions={
            <TicketActionBar
              ticket={ticket}
              permissions={permissions}
              busy={actionLoading}
              pending={pendingAction}
              onAssignToMe={handleAssignToMe}
              onStatusChange={handleStatusChange}
              onApprove={() => setApproveOpen(true)}
              onReject={() => setRejectOpen(true)}
              onCancelRequest={() => setCancelOpen(true)}
            />
          }
        />
        {isEmployeeView && <StatusTracker ticket={ticket} />}
      </div>

      <div className={TICKET_GRID}>
        <div className="flex min-w-0 flex-col gap-6">
          {showFeedbackForm && <FeedbackForm ticket={ticket} onSubmit={handleSubmitFeedback} />}
          <TicketConversation
            ticket={ticket}
            comments={visibleComments}
            permissions={permissions}
            onSaveEdit={handleSaveEdit}
            onRequestDelete={setDeleteCommentId}
          />
          <TicketComposer ticket={ticket} permissions={permissions} onSubmit={handleAddComment} />
        </div>

        <aside aria-label="Ticket details" className={cn(TICKET_ASIDE, asideTop(permissions.isStaff))}>
          <TicketPropertiesPanel
            ticket={ticket}
            permissions={permissions}
            agents={agents}
            busy={actionLoading}
            onStatusChange={handleStatusChange}
            onReassign={handleReassign}
          />
          {permissions.isStaff && <RequesterCard ticket={ticket} />}
          {feedback ? (
            <FeedbackSummary feedback={feedback} isMine={String(feedback.user_id) === permissions.userId} />
          ) : (
            isDone && permissions.isStaff && <FeedbackAwaiting requesterName={ticket.requester_name} />
          )}
          {isEmployeeView && <EmployeeHelpCard ticket={ticket} />}
        </aside>
      </div>

      <ReasonDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Approve ${formatTicketRef(ticket.ticket_id)}?`}
        description="The request moves on to the department's agents."
        label="Approval note"
        placeholder="Anything the agent should know"
        confirmLabel="Approve"
        busy={actionLoading}
        onConfirm={handleApprove}
      />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ${formatTicketRef(ticket.ticket_id)}?`}
        description="The requester sees this reason."
        label="Reason"
        placeholder="Why is this request rejected?"
        required
        destructive
        confirmLabel="Reject"
        busy={actionLoading}
        onConfirm={handleReject}
      />
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {formatTicketRef(ticket.ticket_id)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {ticket.department_name ?? "The team"} stops working on it. If you still need help later, start a new request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setCancelOpen(false);
                void handleStatusChange("Cancelled");
              }}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteCommentId !== null} onOpenChange={(open) => !open && setDeleteCommentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>The comment is removed from the ticket. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteCommentId !== null && handleDeleteComment(deleteCommentId)}
            >
              Delete comment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Need to change something?" for the requester (briefing p.41) */
function EmployeeHelpCard({ ticket }: { ticket: Ticket }) {
  const status = displayStatus(ticket);
  if (status === "cancelled") return null;
  // Replies from the requester are emailed to the assignee; without one the team sees them on the ticket
  const reaches = ticket.assignee_email
    ? `${firstName(ticket.assignee_name)} gets an email`
    : `the ${ticket.department_name ?? "support"} team sees it`;
  const text =
    status === "new" || status === "pending"
      ? `Add details as a reply and ${reaches}. You can cancel while the request is new or waiting for approval.`
      : status === "resolved" || status === "closed"
        ? `Still not working? Reply below and ${reaches}.`
        : `Add details as a reply below and ${reaches}.`;
  return (
    <SectionCard className="bg-muted/30">
      <div className="flex gap-3">
        <LifeBuoy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Need to change something?</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
      </div>
    </SectionCard>
  );
}
