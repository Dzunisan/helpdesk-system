import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CircleCheck, CircleX } from "lucide-react";
import type { Ticket } from "@/types/ticket.types";
import { formatAge, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import KeyValueList from "@/components/app/KeyValueList";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type Decision = "approve" | "reject";

interface ApprovalSheetProps {
  /** The request under review; the sheet is open while this is set */
  ticket: Ticket | null;
  onOpenChange: (open: boolean) => void;
  /** Runs the approve / reject call. Resolves when done; the page closes the sheet on success. */
  onDecide: (ticket: Ticket, decision: Decision, text: string) => Promise<void>;
  /** A decision is being saved */
  busy: boolean;
}

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "The requester";

/**
 * The decision drawer for one approval request (briefing p.56): every field the employee
 * filled in, then Approve / Reject as two big choices. Rejecting needs a reason, which the
 * requester sees on their request; an approval note is an internal note for the team.
 */
export default function ApprovalSheet({ ticket, onOpenChange, onDecide, busy }: ApprovalSheetProps) {
  return (
    <Sheet open={ticket !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        // Keep focus inside the drawer without making a choice look picked or ringing the close button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        {/* Keyed so a new request always starts with a clean decision */}
        {ticket && <ApprovalForm key={ticket.ticket_id} ticket={ticket} onCancel={() => onOpenChange(false)} onDecide={onDecide} busy={busy} />}
      </SheetContent>
    </Sheet>
  );
}

function ApprovalForm({
  ticket,
  onCancel,
  onDecide,
  busy,
}: {
  ticket: Ticket;
  onCancel: () => void;
  onDecide: ApprovalSheetProps["onDecide"];
  busy: boolean;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const requester = ticket.requester_name?.trim() || "Employee";
  const who = firstName(ticket.requester_name);
  const team = ticket.department_name || "the team";
  const missingReason = decision === "reject" && text.trim().length === 0;
  const showError = touched && missingReason;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (missingReason) textRef.current?.focus();
    if (!decision || missingReason) return;
    await onDecide(ticket, decision, text.trim());
  };

  const details = [
    { label: "Request type", value: ticket.request_type_name || "—" },
    ...(ticket.category_name ? [{ label: "Category", value: ticket.category_name }] : []),
    { label: "Priority", value: <PriorityBadge priority={ticket.ticket_priority} /> },
    { label: "Submitted", value: formatSast(ticket.created_at, "full") },
    { label: "Waiting", value: formatAge(ticket.created_at) },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col" noValidate>
      <SheetHeader className="gap-3 border-b border-border px-6 pt-6 pr-14 pb-5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <TicketRef id={ticket.ticket_id} />
          {ticket.request_type_name && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{ticket.request_type_name}</span>
            </>
          )}
        </p>
        <SheetTitle className="text-lg leading-snug font-semibold tracking-tight text-balance">{ticket.title}</SheetTitle>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <UserAvatar name={requester} size="sm" description={ticket.requester_email ?? undefined} />
          <StatusBadge status={ticket.ticket_status} />
        </div>
        <SheetDescription className="sr-only">
          Review the request from {requester} and approve or reject it.
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <section aria-labelledby="approval-details" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h3 id="approval-details" className="text-sm font-semibold text-foreground">
              What {who} asked for
            </h3>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
              <Link to={`/department-lead/tickets/${ticket.ticket_id}`}>
                Open ticket
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          {ticket.description ? (
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
              {ticket.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No description was given.</p>
          )}
          <KeyValueList items={details} />
        </section>

        <Separator />

        <section aria-labelledby="approval-decision" className="flex flex-col gap-4">
          <h3 id="approval-decision" className="text-sm font-semibold text-foreground">
            Decision
          </h3>
          <RadioGroup
            aria-labelledby="approval-decision"
            value={decision ?? ""}
            onValueChange={(v) => {
              setDecision(v as Decision);
              setTouched(false);
              // A reason is required to reject: take the lead straight to the box (after it renders)
              if (v === "reject") requestAnimationFrame(() => textRef.current?.focus());
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <FieldLabel htmlFor="decision-approve" className="cursor-pointer">
              <Field orientation="horizontal" className="!p-4">
                <FieldContent className="gap-1">
                  <FieldTitle className="gap-2">
                    <CircleCheck className="size-4 text-primary" aria-hidden />
                    Approve
                  </FieldTitle>
                  <FieldDescription className="text-xs">
                    {ticket.assignee_name ? `Goes to ${ticket.assignee_name} to work on` : `Joins the ${team} queue as New`}
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value="approve" id="decision-approve" />
              </Field>
            </FieldLabel>
            <FieldLabel
              htmlFor="decision-reject"
              className="cursor-pointer has-data-checked:border-destructive/40 has-data-checked:bg-destructive/5"
            >
              <Field orientation="horizontal" className="!p-4">
                <FieldContent className="gap-1">
                  <FieldTitle className="gap-2">
                    <CircleX className="size-4 text-destructive" aria-hidden />
                    Reject
                  </FieldTitle>
                  <FieldDescription className="text-xs">The request is cancelled</FieldDescription>
                </FieldContent>
                <RadioGroupItem
                  value="reject"
                  id="decision-reject"
                  className="data-checked:border-destructive data-checked:bg-destructive"
                />
              </Field>
            </FieldLabel>
          </RadioGroup>

          {decision && (
            <Field data-invalid={showError || undefined}>
              <FieldLabel htmlFor="decision-text" className="gap-1.5">
                {decision === "reject" ? "Reason" : "Note for the team"}
                <span className="font-normal text-muted-foreground">
                  · {decision === "reject" ? `${who} will see this` : "optional"}
                </span>
              </FieldLabel>
              <Textarea
                id="decision-text"
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="min-h-24"
                placeholder={
                  decision === "reject"
                    ? `Tell ${who} why, and what they can do instead`
                    : "Anything the agent should know before starting"
                }
                aria-invalid={showError || undefined}
                aria-required={decision === "reject"}
              />
              {showError ? (
                <FieldError>Add a reason so {who} knows why.</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  {decision === "reject"
                    ? "Required. Shown to them on their request."
                    : "Saved as an internal note on the ticket. The employee doesn't see it."}
                </FieldDescription>
              )}
            </Field>
          )}
        </section>
      </div>

      <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={decision === "reject" ? "destructive" : "default"}
          disabled={!decision || busy}
          className={cn("min-w-36", decision === "reject" && "bg-destructive text-primary-foreground hover:bg-destructive/90")}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {decision === "reject" ? "Reject request" : decision === "approve" ? "Approve request" : "Choose a decision"}
        </Button>
      </SheetFooter>
    </form>
  );
}
