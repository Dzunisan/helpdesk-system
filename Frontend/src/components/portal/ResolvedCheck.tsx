import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { Ticket } from "@/types/api";
import { formatSast } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firstNameOf } from "./portalText";

interface ResolvedCheckProps {
  ticket: Ticket;
  /** "confirm_fixed" is in GET /actions */
  canConfirm: boolean;
  /** "still_broken" is in GET /actions (Resolved, within 5 days) */
  canReopen: boolean;
  /** When "Still broken" disappears and the request closes on its own */
  reopenUntil: string | null;
  onConfirm: () => Promise<boolean>;
  onReopen: (note: string) => Promise<boolean>;
}

/**
 * "Is it fixed?" on a Resolved request (briefing p.41, p.45): the agent's resolution note,
 * big "Yes, it's fixed" / "No, still broken" buttons, and when it closes by itself.
 */
export default function ResolvedCheck({ ticket, canConfirm, canReopen, reopenUntil, onConfirm, onReopen }: ResolvedCheckProps) {
  const [busy, setBusy] = useState<"confirm" | "reopen" | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [note, setNote] = useState("");
  const resolver = ticket.assignee_name;

  if (!canConfirm && !canReopen) return null;

  const confirm = async () => {
    setBusy("confirm");
    await onConfirm();
    setBusy(null);
  };

  const reopen = async () => {
    setBusy("reopen");
    const ok = await onReopen(note.trim());
    setBusy(null);
    if (ok) {
      setReopenOpen(false);
      setNote("");
    }
  };

  return (
    <Card className="gap-5 border border-primary/20 bg-secondary/60 shadow-none ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">Is it fixed?</CardTitle>
        <CardDescription>
          {resolver ? `${resolver} marked this resolved` : "The team marked this resolved"}
          {ticket.resolved_at && ` on ${formatSast(ticket.resolved_at)}`}. Let us know if it works.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {ticket.resolution_note && (
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {resolver ? `${firstNameOf(resolver)}'s resolution note` : "Resolution note"}
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{ticket.resolution_note}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          {canConfirm && (
            <Button size="lg" className="h-11 w-full sm:h-10 sm:w-auto" disabled={busy !== null} onClick={() => void confirm()}>
              {busy === "confirm" ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Yes, it's fixed
            </Button>
          )}
          {canReopen && (
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full bg-background sm:h-10 sm:w-auto"
              disabled={busy !== null}
              onClick={() => setReopenOpen(true)}
            >
              <RotateCcw data-icon="inline-start" />
              No, still broken
            </Button>
          )}
        </div>
        {reopenUntil && (
          <p className="text-xs text-muted-foreground">
            Closes automatically on {formatSast(reopenUntil, "day")} if we don't hear from you.
          </p>
        )}
      </CardContent>

      <Dialog open={reopenOpen} onOpenChange={(open) => busy === null && setReopenOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Still broken?</DialogTitle>
            <DialogDescription>
              We'll reopen the request and {resolver ? firstNameOf(resolver) : "the team"} will pick it up again.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="still-broken-note">What's still not working?</FieldLabel>
            <Textarea
              id="still-broken-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. The VPN still drops after about an hour."
              className="min-h-24"
              disabled={busy !== null}
            />
            <FieldDescription className="text-xs">Optional, but it helps them fix it first time.</FieldDescription>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy !== null}>
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={busy !== null} onClick={() => void reopen()}>
              {busy === "reopen" ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
              Reopen request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
