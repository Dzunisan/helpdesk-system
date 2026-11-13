import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ClaimButtonProps {
  ticketId: number;
  onClaim: () => void;
  /** This ticket is being claimed right now */
  claiming?: boolean;
  /** Another claim is running: disable without a spinner */
  disabled?: boolean;
  className?: string;
}

/**
 * The secondary "Claim" button on a queue row (briefing p.46, p.47). Claims in place; never navigates.
 * Sits above a ListRowLink (relative z-10) and is 40px tall on phones.
 */
export function ClaimButton({ ticketId, onClaim, claiming, disabled, className }: ClaimButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClaim}
      disabled={claiming || disabled}
      aria-label={`Claim ${formatTicketRef(ticketId)}`}
      className={cn("relative z-10 h-10 min-w-[4.75rem] sm:h-8", className)}
    >
      {claiming ? <Spinner className="size-3.5" /> : null}
      {claiming ? "Claiming" : "Claim"}
    </Button>
  );
}

interface ClaimNextButtonProps {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Show the "C" shortcut hint (desktop only) */
  shortcut?: boolean;
}

/** The page's primary "Claim next" button: claims the most urgent unassigned ticket */
export function ClaimNextButton({ onClick, disabled, busy, shortcut = true }: ClaimNextButtonProps) {
  return (
    <Button onClick={onClick} disabled={disabled || busy} className="h-10 sm:h-9">
      {busy ? <Spinner data-icon="inline-start" /> : <Zap data-icon="inline-start" />}
      Claim next
      {shortcut && (
        <Kbd className="ml-1 hidden h-5 bg-primary-foreground/15 text-primary-foreground sm:inline-flex" aria-hidden>
          C
        </Kbd>
      )}
    </Button>
  );
}
