import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ClipboardCheck, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { approveTicket, listTickets, rejectTicket } from "@/services/tickets";
import type { Ticket } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { formatAge, formatSast } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import ApprovalSheet, { type Decision } from "@/components/lead/ApprovalSheet";
import { Button } from "@/components/ui/button";

// One grid for the header, the rows and the loading rows. Below xl (laptops and down) the rows
// stack, so titles never get squeezed to a few characters beside the sidebar.
const ROW_GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_13rem_6.5rem_4.5rem_1rem] xl:items-center xl:gap-6";

/** The drawer is driven by ?review=<ticket id>, so it can be linked to and the back button closes it */
const REVIEW_PARAM = "review";

export default function Approvals() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  // Bumped by Refresh / Try again; the effect below does the fetching (state only changes once it settles)
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listTickets({ status: "Pending approval", limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setTickets(res.tickets || []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load approval requests");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loadPendingTickets = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const reviewId = Number(searchParams.get(REVIEW_PARAM));
  const reviewing = useMemo(
    () => (reviewId ? tickets.find((t) => t.ticket_id === reviewId) ?? null : null),
    [tickets, reviewId],
  );

  const closeReview = useCallback(() => {
    // Opened from a row: step back so the history stays clean. Opened from a link: just drop the param.
    if ((location.state as { fromList?: boolean } | null)?.fromList) {
      navigate(-1);
    } else {
      const next = new URLSearchParams(searchParams);
      next.delete(REVIEW_PARAM);
      setSearchParams(next, { replace: true });
    }
  }, [location.state, navigate, searchParams, setSearchParams]);

  const handleDecide = async (ticket: Ticket, decision: Decision, text: string) => {
    const ref = `HD-${ticket.ticket_id}`;
    setDeciding(true);
    try {
      if (decision === "approve") {
        await approveTicket(ticket.ticket_id, text || undefined);
        toast.success(`${ref} approved`, { description: `It's now in the ${ticket.department_name ?? "team"} queue.` });
      } else {
        await rejectTicket(ticket.ticket_id, text);
        toast.success(`${ref} rejected`, { description: `${ticket.requester_name ?? "The requester"} can see your reason.` });
      }
      closeReview();
      setTickets((prev) => prev.filter((t) => t.ticket_id !== ticket.ticket_id));
    } catch (err) {
      toast.error(decision === "approve" ? "Approval failed" : "Rejection failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeciding(false);
    }
  };

  const team = departmentName ?? tickets[0]?.department_name ?? null;
  const count = tickets.length;
  const description = team
    ? `${team} requests that need your sign-off before work starts.`
    : "Requests that need your sign-off before work starts.";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Approvals"
        description={description}
        actions={
          <Button variant="outline" onClick={loadPendingTickets} disabled={loading}>
            <RotateCw data-icon="inline-start" className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      {error && !loading ? (
        <ErrorState title="Couldn't load the approval requests" onRetry={loadPendingTickets} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground">Waiting for you</h2>
            {!loading && count > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {count} {count === 1 ? "request" : "requests"}
              </span>
            )}
          </div>

          <ListCard>
            <ListHeaderRow grid={ROW_GRID}>
              <span>Request</span>
              <span>Requested by</span>
              <span>Priority</span>
              <span>Waiting</span>
              <span />
            </ListHeaderRow>

            {loading ? (
              <LoadingRows grid={ROW_GRID} breakpoint="xl" columns={["title", "avatar", "badge", "meta", "blank"]} />
            ) : count === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="All caught up"
                description="Nothing is waiting for your approval. Purchase and access requests land here when employees submit them."
              />
            ) : (
              <ListBody>
                {tickets.map((t) => (
                  <ListRow
                    key={t.ticket_id}
                    grid={ROW_GRID}
                    to={`?${REVIEW_PARAM}=${t.ticket_id}`}
                    state={{ fromList: true }}
                    selected={reviewing?.ticket_id === t.ticket_id}
                    aria-label={`Review HD-${t.ticket_id}: ${t.title}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">
                        <TicketRef id={t.ticket_id} />
                        {t.category_name && <> · {t.category_name}</>}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{t.title}</p>
                    </div>

                    <div className="min-w-0">
                      <UserAvatar
                        name={t.requester_name || "Employee"}
                        size="sm"
                        description={<span className="hidden xl:inline">{t.requester_email}</span>}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 xl:contents">
                      <div>
                        <PriorityBadge priority={t.ticket_priority} />
                      </div>
                      <span
                        className="text-xs text-muted-foreground tabular-nums xl:text-sm xl:text-foreground"
                        title={`Submitted ${formatSast(t.created_at, "full")}`}
                      >
                        <span className="xl:hidden">Waiting </span>
                        {formatAge(t.created_at)}
                      </span>
                      <ChevronRight
                        className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 xl:block"
                        aria-hidden
                      />
                    </div>
                  </ListRow>
                ))}
              </ListBody>
            )}
          </ListCard>

          {!loading && count > 0 && (
            <ListCaption>
              Only {team ?? "your department's"} requests appear here. Approving sends the request to the team queue.
            </ListCaption>
          )}
        </div>
      )}

      <ApprovalSheet
        ticket={reviewing}
        onOpenChange={(open) => {
          if (!open && !deciding) closeReview();
        }}
        onDecide={handleDecide}
        busy={deciding}
      />
    </div>
  );
}
