import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ClipboardCheck, History, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { approveRequest, listApprovals, rejectRequest } from "@/services/approvals";
import { listCategories } from "@/services/categories";
import type { ApprovalItem, CategoryField } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { useApiData } from "@/hooks/useApiData";
import { formatDuration, formatSast, formatTicketRef } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import ApprovalSheet, { type Decision } from "@/components/lead/ApprovalSheet";
import DecisionBadge from "@/components/lead/DecisionBadge";
import { requestCost } from "@/components/lead/requestFields";
import { Button } from "@/components/ui/button";

type Tab = "waiting" | "decided";

// Ref · Request · Type · Cost (or Decision) · Waiting (or Decided) · chevron. One grid for the
// header, the rows and the loading rows; below xl the rows stack as cards.
const ROW_GRID =
  "xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_9.5rem_8rem_6.5rem_1rem] xl:items-center xl:gap-6";

/** The drawer is driven by ?review=<ticket id>, so it can be linked to and the back button closes it */
const REVIEW_PARAM = "review";
const PAGE_SIZE = 50;

const loadCategories = async () => (await listCategories()).categories;

/**
 * S6 Approvals (briefing p.15, p.56): the lead's own department's requests that cost money or
 * grant access. Waiting for me / Decided by me tabs; a row opens the decision drawer.
 */
export default function Approvals() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [deciding, setDeciding] = useState(false);

  const tab: Tab = searchParams.get("tab") === "decided" ? "decided" : "waiting";
  const pending = useApiData(() => listApprovals({ status: "pending", limit: PAGE_SIZE }), "approvals-pending");
  const decided = useApiData(() => listApprovals({ decided_by: "me", limit: PAGE_SIZE }), "approvals-decided");
  const categories = useApiData(loadCategories, "categories");

  const fieldsOf = useCallback(
    (categoryId: number): CategoryField[] =>
      categories.data?.find((c) => c.category_id === categoryId)?.fields ?? [],
    [categories.data],
  );

  const current = tab === "waiting" ? pending : decided;
  const items = useMemo(() => current.data?.approvals ?? [], [current.data]);

  const reviewId = Number(searchParams.get(REVIEW_PARAM));
  const reviewing = useMemo<ApprovalItem | null>(
    () => (reviewId ? items.find((a) => a.ticket.ticket_id === reviewId) ?? null : null),
    [items, reviewId],
  );

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.delete(REVIEW_PARAM);
    if (next === "decided") params.set("tab", "decided");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

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

  const handleDecide = async (item: ApprovalItem, decision: Decision, text: string) => {
    const { ticket } = item;
    const ref = formatTicketRef(ticket.ticket_id);
    setDeciding(true);
    try {
      if (decision === "approve") {
        await approveRequest(ticket.ticket_id, text ? { note: text } : {});
        toast.success(`${ref} approved`, { description: `It's now in the ${ticket.department_name ?? "team"} queue. The SLA clock has started.` });
      } else {
        await rejectRequest(ticket.ticket_id, { reason: text });
        toast.success(`${ref} rejected`, { description: `${ticket.requester_name ?? "The requester"} can see your reason.` });
      }
      closeReview();
      pending.setData((data) =>
        data
          ? {
              ...data,
              approvals: data.approvals.filter((a) => a.ticket.ticket_id !== ticket.ticket_id),
              pagination: { ...data.pagination, total: Math.max(0, data.pagination.total - 1) },
            }
          : data,
      );
      decided.reload();
    } catch (err) {
      toast.error(decision === "approve" ? "Couldn't approve the request" : "Couldn't reject the request", {
        description: err instanceof Error ? err.message : undefined,
      });
      // Someone else may have decided it already: refresh the list behind the drawer
      pending.reload();
    } finally {
      setDeciding(false);
    }
  };

  const refresh = () => {
    pending.reload();
    decided.reload();
  };

  const team = departmentName ?? pending.data?.approvals[0]?.ticket.department_name ?? null;
  const pendingCount = pending.data?.pagination.total ?? pending.data?.approvals.length;
  const decidedCount = decided.data?.pagination.total ?? decided.data?.approvals.length;
  const refreshing = pending.refreshing || decided.refreshing;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Approvals"
        description={
          team ? `${team} requests that need your sign-off before work starts` : "Requests that need your sign-off before work starts"
        }
        actions={
          <Button variant="outline" onClick={refresh} disabled={pending.loading} className="h-10 sm:h-9">
            <RotateCw data-icon="inline-start" className={refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <FilterTabs
          aria-label="Approvals"
          value={tab}
          onValueChange={setTab}
          className="sm:self-start"
          items={[
            { value: "waiting", label: "Waiting for me", count: pendingCount },
            { value: "decided", label: "Decided by me", count: decidedCount },
          ]}
        />

        {current.error && !current.data ? (
          <ErrorState
            title={tab === "waiting" ? "Couldn't load the approval requests" : "Couldn't load your decisions"}
            description={current.error.status === 0 ? undefined : current.error.message}
            onRetry={current.reload}
          />
        ) : (
          <ListCard>
            <ListHeaderRow grid={ROW_GRID}>
              <span>Ref</span>
              <span>Request</span>
              <span>Type</span>
              <span>{tab === "waiting" ? "Cost" : "Decision"}</span>
              <span>{tab === "waiting" ? "Waiting" : "Decided"}</span>
              <span />
            </ListHeaderRow>

            {current.loading && !current.data ? (
              <LoadingRows grid={ROW_GRID} breakpoint="xl" columns={["meta", "title", "text", "meta", "meta", "blank"]} />
            ) : items.length === 0 ? (
              tab === "waiting" ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="All caught up"
                  description="Nothing is waiting for your approval. Purchase and access requests land here when employees submit them."
                />
              ) : (
                <EmptyState
                  icon={History}
                  title="No decisions yet"
                  description="Requests you approve or reject appear here, with the reason you gave."
                />
              )
            ) : (
              <ListBody>
                {items.map((a) => (
                  <ApprovalRow
                    key={`${a.ticket.ticket_id}-${a.decided_at ?? ""}`}
                    item={a}
                    tab={tab}
                    cost={requestCost(a.ticket, fieldsOf(a.ticket.ticket_category_id))}
                    selected={reviewing?.ticket.ticket_id === a.ticket.ticket_id}
                    to={`?${new URLSearchParams({ ...(tab === "decided" ? { tab } : {}), [REVIEW_PARAM]: String(a.ticket.ticket_id) })}`}
                  />
                ))}
              </ListBody>
            )}
          </ListCard>
        )}

        {!current.loading && items.length > 0 && (
          <ListCaption>
            Only {team ?? "your department's"} requests appear here.{" "}
            {tab === "waiting" ? "Approving starts the SLA clock." : "Newest decision first."}
          </ListCaption>
        )}
      </div>

      <ApprovalSheet
        item={reviewing}
        fields={reviewing ? fieldsOf(reviewing.ticket.ticket_category_id) : []}
        onOpenChange={(open) => {
          if (!open && !deciding) closeReview();
        }}
        onDecide={handleDecide}
        busy={deciding}
      />
    </div>
  );
}

function ApprovalRow({
  item: a,
  tab,
  cost,
  selected,
  to,
}: {
  item: ApprovalItem;
  tab: Tab;
  cost: string | null;
  selected: boolean;
  to: string;
}) {
  const t = a.ticket;
  const waited = formatDuration(a.waiting_mins);
  return (
    <ListRow
      grid={ROW_GRID}
      to={to}
      state={{ fromList: true }}
      selected={selected}
      aria-label={`Review ${formatTicketRef(t.ticket_id)}: ${t.title}`}
    >
      <TicketRef id={t.ticket_id} className="hidden xl:block" />

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground xl:hidden">
          <TicketRef id={t.ticket_id} />
          {t.category_name && <span className="truncate">· {t.category_name}</span>}
        </p>
        <p className="line-clamp-2 text-sm font-medium text-foreground">{t.title}</p>
        <UserAvatar name={t.requester_name || "Employee"} size="sm" showName nameClassName="text-xs text-muted-foreground" />
      </div>

      <span className="hidden truncate text-sm text-foreground xl:block">{t.category_name ?? "—"}</span>

      {/* Phones and laptops: cost/decision and age on one line; wide screens: their own columns */}
      <div className="flex items-center justify-between gap-3 xl:contents">
        {tab === "waiting" ? (
          <span className="text-sm font-medium text-foreground tabular-nums">{cost ?? <span className="font-normal text-muted-foreground"><span className="xl:hidden">No cost</span><span className="hidden xl:inline">—</span></span>}</span>
        ) : (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <DecisionBadge decision={a.decision ?? "approved"} />
            {a.reason && <span className="line-clamp-1 text-xs text-muted-foreground xl:hidden">{a.reason}</span>}
          </div>
        )}
        <span
          className="text-xs text-muted-foreground tabular-nums xl:text-sm xl:text-foreground"
          title={tab === "waiting" ? `Submitted ${formatSast(t.created_at, "full")}` : formatSast(a.decided_at, "full")}
        >
          {tab === "waiting" ? (
            <>
              <span className="xl:hidden">Waiting </span>
              {waited}
            </>
          ) : (
            formatSast(a.decided_at, "day")
          )}
        </span>
        <ChevronRight
          className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 xl:block"
          aria-hidden
        />
      </div>
    </ListRow>
  );
}
