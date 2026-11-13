import { useState } from "react";
import { CircleX } from "lucide-react";
import { formatTicketRef } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * "Cancel request" while a request is New or Pending approval (briefing p.4, p.41), with an
 * AlertDialog instead of window.confirm. Shown only when "cancel" is in GET /actions.
 */
export default function CancelRequestButton({
  ticketId,
  onCancel,
  className,
}: {
  ticketId: number;
  /** Resolves true when cancelled */
  onCancel: () => Promise<boolean>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    const ok = await onCancel();
    setBusy(false);
    if (ok) setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-10 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive", className)}
        >
          <CircleX data-icon="inline-start" />
          Cancel request
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {formatTicketRef(ticketId)}?</AlertDialogTitle>
          <AlertDialogDescription>
            The team stops working on it and it moves to Cancelled. This can't be undone; you can always
            start a new request.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void cancel();
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            Cancel request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
