import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTickets, approveTicket, rejectTicket } from "../../services/ticketService";
import type { Ticket } from "../../types/ticket.types";
import { toast } from "sonner";
import ReasonDialog from "@/components/app/ReasonDialog";
import Loader from "../../components/legacy/Loader";
import { Button } from "../../components/legacy/Button";

export default function Approvals() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  // Which ticket the approve / reject dialog is open for (replaces window.prompt)
  const [approveId, setApproveId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);

  const loadPendingTickets = async () => {
    setLoading(true);
    try {
      const res = await fetchTickets({ status: "Pending approval", limit: 50 });
      setTickets(res.tickets || []);
    } catch (err: any) {
      console.error("Failed to load approval requests:", err);
      toast.error(err.message || "Failed to load approval requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingTickets();
  }, []);

  const handleApprove = async (ticketId: number, note: string) => {
    setApproveId(null);
    setActionLoading(ticketId);
    try {
      await approveTicket(ticketId, note || undefined);
      toast.success(`HD-${ticketId} approved`);
      setTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
    } catch (err: any) {
      toast.error(err.message || "Approval failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (ticketId: number, reason: string) => {
    setRejectId(null);
    setActionLoading(ticketId);
    try {
      await rejectTicket(ticketId, reason);
      toast.success(`HD-${ticketId} rejected`);
      setTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
    } catch (err: any) {
      toast.error(err.message || "Rejection failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Approvals</h1>
          <p className="text-sm text-gray-600 mt-1">
            Review and execute Approve or Reject actions for employee requests pending authorization.
          </p>
        </div>
        <Button
        variant="outline"
          onClick={loadPendingTickets}
        >
          Refresh List
        </Button>
      </div>

      {/* Table / List */}
      {loading ? (
     <Loader/>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <h3 className="text-base font-semibold text-gray-800">All caught up!</h3>
          <p className="text-sm text-gray-500 mt-1">There are no requests currently pending approval.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left">
              <tr>
                <th className="px-6 py-3.5">Ticket</th>
                <th className="px-6 py-3.5">Requester</th>
                <th className="px-6 py-3.5">Department</th>
                <th className="px-6 py-3.5">Priority</th>
                <th className="px-6 py-3.5">Submitted</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tickets.map((t) => (
                <tr key={t.ticket_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">
                      <Link
                        to={`/department-lead/tickets/${t.ticket_id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        HD-{t.ticket_id} - {t.title}
                      </Link>
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{t.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    <div>{t.requester_name || "Employee"}</div>
                    {t.requester_email && (
                      <div className="text-xs text-gray-400">{t.requester_email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {t.department_name || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        t.ticket_priority === "High"
                          ? "bg-red-100 text-red-800"
                          : t.ticket_priority === "Medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {t.ticket_priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(t.created_at).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      disabled={actionLoading === t.ticket_id}
                      onClick={() => setApproveId(t.ticket_id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shadow-xs transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={actionLoading === t.ticket_id}
                      onClick={() => setRejectId(t.ticket_id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded shadow-xs transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <Link
                      to={`/department-lead/tickets/${t.ticket_id}`}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded inline-block"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReasonDialog
        open={approveId !== null}
        onOpenChange={(open) => !open && setApproveId(null)}
        title={`Approve HD-${approveId}?`}
        description="The request moves on to the department's agents."
        label="Approval note"
        placeholder="Anything the agent should know"
        confirmLabel="Approve"
        busy={actionLoading !== null}
        onConfirm={(note) => {
          if (approveId !== null) return handleApprove(approveId, note);
        }}
      />
      <ReasonDialog
        open={rejectId !== null}
        onOpenChange={(open) => !open && setRejectId(null)}
        title={`Reject HD-${rejectId}?`}
        description="The requester sees this reason."
        label="Reason"
        placeholder="Why is this request rejected?"
        required
        destructive
        confirmLabel="Reject"
        busy={actionLoading !== null}
        onConfirm={(reason) => {
          if (rejectId !== null) return handleReject(rejectId, reason);
        }}
      />
    </div>
  );
}
