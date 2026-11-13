import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { assignTicket, claimTicket } from "@/services/tickets";
import { toApiError } from "@/services/apiClient";
import type { Ticket } from "@/types/api";
import { formatTicketRef } from "@/lib/format";

interface UseClaimOptions {
  /** Base path for the "Open" action in the toast, e.g. "/agent" */
  basePath: string;
  /** After a successful claim or assignment (refresh the lists) */
  onDone?: (ticket: Ticket) => void;
  /** Someone else got there first, or the ticket moved on (409): refresh the list */
  onConflict?: () => void;
}

export interface Assignee {
  id: string;
  /** "Thabo Nkosi", or "you" */
  name: string;
}

/**
 * Claim (POST /claim) or assign (PATCH /assign) without leaving the page (briefing p.46-47:
 * "Claim buttons that don't navigate"), with one set of toasts: success with an "Open" action,
 * 409 "Sipho claimed this a moment ago" (the server's words) and a refresh, other errors.
 */
export function useClaim({ basePath, onDone, onConflict }: UseClaimOptions) {
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const run = useCallback(
    async (ticket: Pick<Ticket, "ticket_id" | "title">, assignee?: Assignee) => {
      const ref = formatTicketRef(ticket.ticket_id);
      setPendingId(ticket.ticket_id);
      try {
        const updated = assignee
          ? await assignTicket(ticket.ticket_id, { assignee_id: assignee.id })
          : await claimTicket(ticket.ticket_id);
        toast.success(assignee && assignee.name !== "you" ? `${ref} assigned to ${assignee.name}` : `${ref} is yours`, {
          description: ticket.title,
          action: { label: "Open", onClick: () => navigate(`${basePath}/tickets/${ticket.ticket_id}`) },
        });
        onDone?.(updated);
        return updated;
      } catch (err) {
        const error = toApiError(err);
        if (error.status === 409) {
          toast.warning(error.message || `Someone else just took ${ref}`, { description: "The list has been refreshed." });
          onConflict?.();
        } else {
          toast.error(assignee ? `Couldn't assign ${ref}` : `Couldn't claim ${ref}`, { description: error.message });
        }
        return null;
      } finally {
        setPendingId(null);
      }
    },
    [basePath, navigate, onDone, onConflict],
  );

  const claim = useCallback((ticket: Pick<Ticket, "ticket_id" | "title">) => run(ticket), [run]);
  const assign = useCallback((ticket: Pick<Ticket, "ticket_id" | "title">, assignee: Assignee) => run(ticket, assignee), [run]);

  return { claim, assign, pendingId, busy: pendingId !== null };
}

/**
 * Keyboard shortcut "C" for "Claim next" (briefing p.46). Ignored while typing in a field,
 * with modifier keys held, or while a menu/dialog is open.
 */
export function useClaimNextShortcut(onClaimNext: () => void, enabled: boolean) {
  const handler = useRef(onClaimNext);
  useEffect(() => {
    handler.current = onClaimNext;
  }, [onClaimNext]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog'], [role='listbox']"))
        return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
