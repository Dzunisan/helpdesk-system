import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronLeft, Lock, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  addComment,
  assignTicket,
  changePriority,
  claimTicket,
  deleteComment,
  editComment,
  transitionTicket,
} from "@/services/tickets";
import { approveTicket, rejectTicket } from "@/services/ticketService";
import { toApiError } from "@/services/apiClient";
import type { Ticket, TicketAction, TicketPriority, TicketStatus } from "@/types/api";
import { formatTicketRef } from "@/lib/format";
import { statusLabel } from "@/lib/ticketVocabulary";
import PageHeader from "@/components/app/PageHeader";
import ErrorState from "@/components/app/ErrorState";
import SectionCard from "@/components/app/SectionCard";
import ReasonDialog from "@/components/app/ReasonDialog";
import { StatusBadge } from "@/components/app/StatusBadge";
import TicketRef from "@/components/app/TicketRef";
import { useNavHighlight } from "@/components/app/navHighlight";
import NotFoundPanel from "@/components/auth/NotFoundPanel";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENT_VIEWS, LEAD_VIEWS, viewById, type TicketLinkState, type TicketView } from "@/components/queue/queueViews";
import type { Assignee } from "@/components/queue/useClaim";
import { useTeam } from "@/components/queue/useTeam";
import StaffActionBar, { type ActionKey } from "./StaffActionBar";
import StaffPropertiesPanel from "./StaffPropertiesPanel";
import TicketComposer, { type SendFollowUp } from "./TicketComposer";
import TicketDetailSkeleton from "./TicketDetailSkeleton";
import TicketListPane from "./TicketListPane";
import TicketTimeline from "./TicketTimeline";
import { permissionsFor } from "./ticketDetail";
import { useStaffTicket } from "./useStaffTicket";

/** lg and up: the three resizable panes; below that one scrolling column */
const DESKTOP_QUERY = "(min-width: 1024px)";
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** The list a ticket most likely belongs to, when the link didn't say */
function defaultView(lead: boolean, ticket: Ticket | null, userId: string): TicketView {
  if (lead) {
    switch (ticket?.ticket_status) {
      case "Open":
        return LEAD_VIEWS.open;
      case "Waiting on employee":
        return LEAD_VIEWS.waiting;
      case "Pending approval":
        return LEAD_VIEWS.pending;
      case "Resolved":
      case "Closed":
        return LEAD_VIEWS.resolved;
      default:
        return LEAD_VIEWS.unassigned;
    }
  }
  if (ticket?.ticket_status === "New") return AGENT_VIEWS.unassigned;
  if (ticket && ticket.assignee_id === userId && (ticket.ticket_status === "Resolved" || ticket.ticket_status === "Closed"))
    return AGENT_VIEWS.resolved;
  return AGENT_VIEWS["my-open"];
}

/** Undoes the shell's page padding so the panes run edge to edge (AppLayout pads every page) */
const FULL_BLEED = "-mx-6 -my-8 sm:-mx-10 sm:-my-10 lg:-mx-16 xl:-mx-24";

/**
 * The staff ticket inbox (briefing p.48-49, S2-S4): left the current view, middle the title,
 * the actions from GET /actions, the merged timeline and the composer, right the properties.
 */
export default function StaffTicketView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const lead = user?.role === "Department Lead";
  const basePath = lead ? "/department-lead" : "/agent";
  const userId = String(user?.user_id ?? user?.id ?? "");
  const desktop = useIsDesktop();

  const { state, reload, retry, setTicket } = useStaffTicket(id);
  const ticket = state.status === "ready" ? state.ticket : null;
  const view = viewById((location.state as TicketLinkState | null)?.view) ?? defaultView(lead, ticket, userId);
  // The sidebar lights up the list this ticket came from
  useNavHighlight(lead ? "/department-lead/all-tickets" : view.path);

  const team = useTeam(lead);
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [listKey, setListKey] = useState(0);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const ref = ticket ? formatTicketRef(ticket.ticket_id) : id ? formatTicketRef(id) : "This ticket";

  /** After any change: new ticket now, then quietly the actions, timeline and the left list */
  const settle = (updated?: Ticket) => {
    if (updated) setTicket(updated);
    void reload();
    setListKey((k) => k + 1);
    if (lead) team.reload();
  };

  const fail = (err: unknown, fallback: string) => {
    const error = toApiError(err, fallback);
    if (error.status === 409) {
      // The state moved under us (someone claimed it, a final status): show the server's words, refresh
      toast.warning(error.message || fallback, { description: "The ticket has been refreshed." });
      settle();
    } else if (error.status === 404) {
      void retry();
    } else {
      toast.error(fallback, { description: error.message });
    }
  };

  const run = async (key: ActionKey, work: () => Promise<void>) => {
    if (!ticket || pending) return false;
    setPending(key);
    try {
      await work();
      return true;
    } catch (err) {
      fail(err, "Couldn't update this ticket");
      return false;
    } finally {
      setPending(null);
    }
  };

  const handleClaim = () =>
    run("claim", async () => {
      settle(await claimTicket(ticket!.ticket_id));
      toast.success(`${ref} is yours`, { description: "Status moved to Open." });
    });

  const handleTransition = (to: TicketStatus, key: TicketAction, note?: string) =>
    run(key, async () => {
      settle(await transitionTicket(ticket!.ticket_id, { to, note }));
      toast.success(to === "Resolved" ? `${ref} resolved` : `Status changed to ${statusLabel(to)}`);
    });

  const handleAssign = (assignee: Assignee) =>
    run("assign", async () => {
      const updated = await assignTicket(ticket!.ticket_id, { assignee_id: assignee.id });
      settle(updated);
      toast.success(assignee.name === "you" ? `${ref} is yours` : `${ref} assigned to ${updated.assignee_name ?? assignee.name}`);
    });

  const handlePriority = (priority: TicketPriority) =>
    run("change_priority", async () => {
      settle(await changePriority(ticket!.ticket_id, priority));
      toast.success(`Priority changed to ${priority}`, { description: "Both due times were recalculated." });
    });

  const handleApprove = (note: string) =>
    run("approve", async () => {
      setApproveOpen(false);
      await approveTicket(ticket!.ticket_id, note || undefined);
      settle();
      toast.success(`${ref} approved`);
    });

  const handleReject = (reason: string) =>
    run("reject", async () => {
      setRejectOpen(false);
      await rejectTicket(ticket!.ticket_id, reason);
      settle();
      toast.success(`${ref} rejected`);
    });

  const handleSend = async (body: string, internal: boolean, followUp: SendFollowUp) => {
    if (!ticket) return false;
    setPending("send");
    try {
      await addComment(ticket.ticket_id, { body, is_internal: internal });
    } catch (err) {
      setPending(null);
      fail(err, internal ? "Couldn't add your note" : "Couldn't send your reply");
      return false;
    }
    try {
      if (followUp === "wait") {
        const updated = await transitionTicket(ticket.ticket_id, { to: "Waiting on employee" });
        settle(updated);
        toast.success("Reply sent", { description: "Status set to Waiting on employee." });
      } else {
        settle();
        toast.success(internal ? "Internal note added" : "Reply sent");
      }
    } catch (err) {
      // The reply is saved even if the status change wasn't
      settle();
      fail(err, "Reply sent, but the status didn't change");
    } finally {
      setPending(null);
    }
    return true;
  };

  const handleSaveEdit = async (commentId: number, body: string) => {
    try {
      await editComment(commentId, body);
      settle();
      toast.success("Message updated");
      return true;
    } catch (err) {
      fail(err, "Couldn't edit the message");
      return false;
    }
  };

  const handleDelete = async (commentId: number) => {
    setDeleteId(null);
    try {
      await deleteComment(commentId);
      settle();
      toast.success("Message deleted");
    } catch (err) {
      fail(err, "Couldn't delete the message");
    }
  };

  // ---- Loading, not found, error -----------------------------------------------------------

  if (state.status === "loading") return desktop ? <PanesSkeleton /> : <TicketDetailSkeleton staff />;

  if (state.status === "notFound") {
    return (
      <section
        aria-labelledby="ticket-not-found-title"
        className="flex min-h-[min(32rem,calc(100svh-14rem))] items-center justify-center rounded-xl border border-border bg-background px-6 py-16"
      >
        <NotFoundPanel
          icon={SearchX}
          title={<span id="ticket-not-found-title">Ticket not found</span>}
          description={`${ref} doesn't exist or isn't in your department. If someone sent you this link, ask them to check the reference.`}
          actions={
            <Button asChild variant="outline">
              <Link to={view.path}>
                <ChevronLeft data-icon="inline-start" />
                Back to {view.label}
              </Link>
            </Button>
          }
        />
      </section>
    );
  }

  if (state.status === "error" || !ticket) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader back={{ to: view.path, label: view.label }} title={ref} />
        <ErrorState
          title="Couldn't load this ticket"
          description={state.status === "error" ? state.message : undefined}
          onRetry={() => void retry()}
        />
      </div>
    );
  }

  // ---- The ticket ----------------------------------------------------------------------------

  const { actions, actionsError, timeline, timelineError } = state;
  const has = (a: TicketAction) => !!actions?.actions.includes(a);
  const permissions = permissionsFor(user, ticket);
  const busy = pending !== null;

  const actionBar = (
    <StaffActionBar
      ticket={ticket}
      actions={actions}
      actionsError={actionsError}
      onRetry={() => void reload()}
      pending={pending}
      onClaim={() => void handleClaim()}
      onTransition={(to, key) => void handleTransition(to, key)}
      onResolve={() => setResolveOpen(true)}
      onApprove={() => setApproveOpen(true)}
      onReject={() => setRejectOpen(true)}
      team={team}
      currentUserId={userId}
      onAssign={(a) => void handleAssign(a)}
    />
  );

  const timelineNode = (
    <TicketTimeline
      ticket={ticket}
      items={timeline}
      error={timelineError}
      onRetry={() => void reload()}
      userId={userId}
      onSaveEdit={handleSaveEdit}
      onRequestDelete={setDeleteId}
    />
  );

  const final = ticket.ticket_status === "Closed" || ticket.ticket_status === "Cancelled";
  const composer =
    actions && (has("reply") || has("internal_note")) ? (
      <TicketComposer
        key={ticket.ticket_id}
        ticket={ticket}
        permissions={permissions}
        onSubmit={handleSend}
        allowReply={has("reply")}
        allowNote={has("internal_note")}
        allowSendAndWait={has("wait")}
      />
    ) : actions && final ? (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden />
        This ticket is {statusLabel(ticket.ticket_status).toLowerCase()}. It's read-only now.
      </p>
    ) : null;

  const properties = (
    <StaffPropertiesPanel
      ticket={ticket}
      currentUserId={userId}
      canChangePriority={has("change_priority")}
      canAssign={has("assign")}
      pending={pending === "change_priority" || pending === "assign" ? pending : null}
      disabled={busy}
      onPriorityChange={(p) => void handlePriority(p)}
      team={team}
      onAssign={(a) => void handleAssign(a)}
    />
  );

  const dialogs = (
    <>
      <ReasonDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title={`Resolve ${ref}?`}
        description={`${ticket.requester_name ?? "The requester"} sees this note and is asked to confirm it's fixed. They can reopen it for 5 days.`}
        label="Resolution note"
        placeholder="What fixed it?"
        required
        confirmLabel="Resolve"
        busy={pending === "resolve"}
        onConfirm={async (note) => {
          if (await handleTransition("Resolved", "resolve", note)) setResolveOpen(false);
        }}
      />
      <ReasonDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Approve ${ref}?`}
        description="The request moves on to the department's agents and its SLA clocks start."
        label="Approval note"
        placeholder="Anything the agent should know"
        confirmLabel="Approve"
        busy={pending === "approve"}
        onConfirm={(note) => void handleApprove(note)}
      />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ${ref}?`}
        description="The requester sees this reason."
        label="Reason"
        placeholder="Why is this request rejected?"
        required
        destructive
        confirmLabel="Reject"
        busy={pending === "reject"}
        onConfirm={(reason) => void handleReject(reason)}
      />
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              The timeline keeps a "Message removed" marker in its place. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteId !== null && void handleDelete(deleteId)}>
              Delete message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (!desktop) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ to: view.path, label: view.label }}
          eyebrow={
            <>
              <TicketRef id={ticket.ticket_id} />
              <StatusBadge status={ticket.ticket_status} />
              {ticket.department_name && <span className="truncate">{ticket.department_name}</span>}
            </>
          }
          title={<span className="break-words">{ticket.title}</span>}
        />
        {actionBar}
        {timelineNode}
        {composer}
        <SectionCard>{properties}</SectionCard>
        {dialogs}
      </div>
    );
  }

  return (
    <div className={`${FULL_BLEED} h-svh`}>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={320} minSize={260} maxSize={440} className="bg-background">
          <TicketListPane view={view} basePath={basePath} currentId={ticket.ticket_id} refreshKey={listKey} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={420}>
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 flex-col gap-3 border-b border-border px-6 py-4">
              <Breadcrumb>
                <BreadcrumbList className="text-xs">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={view.path}>{ticket.department_name ?? view.label}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-mono text-xs text-muted-foreground">{ref}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-lg leading-snug font-semibold tracking-tight text-balance text-foreground">{ticket.title}</h1>
              {actionBar}
            </header>
            <ScrollArea>{timelineNode}</ScrollArea>
            {composer && <div className="shrink-0 border-t border-border bg-background px-6 py-4">{composer}</div>}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={320} minSize={280} maxSize={440}>
          <aside aria-label="Ticket properties" className="h-full overflow-y-auto bg-muted/30 px-6 py-5">
            {properties}
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
      {dialogs}
    </div>
  );
}

function ScrollArea({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-6">{children}</div>;
}

/** Loading state shaped like the three panes */
function PanesSkeleton() {
  const SK = "bg-foreground/[0.07]";
  return (
    <div className={`${FULL_BLEED} grid h-svh grid-cols-[320px_minmax(0,1fr)_320px] divide-x divide-border`} aria-busy="true" aria-label="Loading ticket">
      <div className="flex flex-col">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Skeleton className={`h-4 w-24 ${SK}`} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-border px-4 py-3.5">
            <Skeleton className={`h-3 w-24 ${SK}`} />
            <Skeleton className={`h-4 w-4/5 ${SK}`} />
            <Skeleton className={`h-3 w-32 ${SK}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-4">
          <Skeleton className={`h-3 w-32 ${SK}`} />
          <Skeleton className={`h-6 w-2/3 ${SK}`} />
          <div className="flex gap-2">
            <Skeleton className={`h-8 w-36 ${SK}`} />
            <Skeleton className={`h-8 w-24 ${SK}`} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 bg-muted/20 px-6 py-6">
          <Skeleton className={`h-24 w-full rounded-xl ${SK}`} />
          <Skeleton className={`h-4 w-64 ${SK}`} />
          <Skeleton className={`h-20 w-full rounded-xl ${SK}`} />
        </div>
      </div>
      <div className="flex flex-col gap-4 bg-muted/30 px-6 py-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className={`h-4 w-20 ${SK}`} />
            <Skeleton className={`h-5 w-24 rounded-full ${SK}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
