import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Ticket } from "@/types/ticket.types";
import { formatTicketRef } from "@/lib/format";

type ClaimFn = (ticketId: number, assigneeId?: string | null) => Promise<Ticket>;

interface UseClaimOptions {
  /** `claimTicket` from useTickets (PUT /tickets/:id/assign) */
  claimTicket: ClaimFn;
  /** Base path for the "Open" link in the toast, e.g. "/agent" */
  basePath: string;
  /** Called after a successful claim/assign (refresh other lists) */
  onClaimed?: () => void;
  /** Called when someone else got there first (refresh the queue) */
  onConflict?: () => void;
}

/**
 * Claim (or, for leads, assign) a ticket without leaving the page, with one consistent
 * set of toasts: success with an "Open" action, 409 "someone else got it", other errors.
 */
export function useClaim({ claimTicket, basePath, onClaimed, onConflict }: UseClaimOptions) {
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const claim = useCallback(
    async (ticket: Ticket, assignee?: { id: string; name: string }) => {
      const ref = formatTicketRef(ticket.ticket_id);
      setPendingId(ticket.ticket_id);
      try {
        await claimTicket(ticket.ticket_id, assignee?.id);
        toast.success(assignee ? `${ref} assigned to ${assignee.name}` : `${ref} is yours`, {
          description: ticket.title,
          action: { label: "Open", onClick: () => navigate(`${basePath}/tickets/${ticket.ticket_id}`) },
        });
        onClaimed?.();
      } catch (err: unknown) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 409) {
          toast.warning(`Someone else just took ${ref}`, { description: "The list has been refreshed." });
          onConflict?.();
        } else {
          toast.error(assignee ? `Couldn't assign ${ref}` : `Couldn't claim ${ref}`, {
            description: error.message || "Please try again.",
          });
        }
      } finally {
        setPendingId(null);
      }
    },
    [claimTicket, basePath, navigate, onClaimed, onConflict],
  );

  return { claim, pendingId, busy: pendingId !== null };
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
