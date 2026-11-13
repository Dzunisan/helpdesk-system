import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CircleCheck, CircleX } from "lucide-react";
import type { ApprovalItem, CategoryField } from "@/types/api";
import { firstNameOf, formatDuration, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import TicketRef from "@/components/app/TicketRef";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import DecisionBadge from "./DecisionBadge";
import { requestAnswers, requestCost } from "./requestFields";

export type Decision = "approve" | "reject";

interface ApprovalSheetProps {
  /** The request under review; the sheet is open while this is set */
  item: ApprovalItem | null;
  /** The request's category form fields, for the answers' labels */
  fields: CategoryField[];
  onOpenChange: (open: boolean) => void;
  /** Runs the approve / reject call. Resolves when done; the page closes the sheet on success. */
  onDecide: (item: ApprovalItem, decision: Decision, text: string) => Promise<void>;
  /** A decision is being saved */
  busy: boolean;
}

/**
 * The decision drawer for one approval request (briefing p.15, p.56): every field the employee
 * filled in, then Approve / Reject as two big choices. Rejecting needs a reason, which the
 * requester sees on their request. A request already decided shows the decision instead.
 */
export default function ApprovalSheet({ item, fields, onOpenChange, onDecide, busy }: ApprovalSheetProps) {
  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
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
        {item && (
          <ApprovalForm
            key={`${item.ticket.ticket_id}-${item.decided_at ?? "pending"}`}
            item={item}
            fields={fields}
            onCancel={() => onOpenChange(false)}
            onDecide={onDecide}
            busy={busy}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ApprovalForm({
  item,
  fields,
  onCancel,
  onDecide,
  busy,
}: {
  item: ApprovalItem;
  fields: CategoryField[];
  onCancel: () => void;
  onDecide: ApprovalSheetProps["onDecide"];
  busy: boolean;
}) {
  const { ticket } = item;
  const decided = item.decision !== null;
  const [decision, setDecision] = useState<Decision | null>(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const requester = ticket.requester_name?.trim() || "Employee";
  const who = firstNameOf(ticket.requester_name, "The requester");
  const team = ticket.department_name || "the team";
  const missingReason = decision === "reject" && text.trim().length === 0;
  const showError = touched && missingReason;
  const answers = requestAnswers(ticket, fields);
  const cost = requestCost(ticket, fields);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (decided) return;
    setTouched(true);
    if (missingReason) textRef.current?.focus();
    if (!decision || missingReason) return;
    await onDecide(item, decision, text.trim());
  };

  const facts = [
    { label: "Priority", value: <PriorityBadge priority={ticket.ticket_priority} /> },
    { label: "Submitted", value: formatSast(ticket.created_at, "day") },
    { label: decided ? "Waited" : "Waiting", value: formatDuration(item.waiting_mins) },
  ].filter(Boolean) as { label: string; value: ReactNode }[];

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col" noValidate>
      <SheetHeader className="gap-3 border-b border-border px-6 pt-6 pr-14 pb-5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <TicketRef id={ticket.ticket_id} />
          {ticket.category_name && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{ticket.category_name}</span>
            </>
          )}
        </p>
        <SheetTitle className="text-lg leading-snug font-semibold tracking-tight text-balance">{ticket.title}</SheetTitle>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <UserAvatar name={requester} size="sm" description={ticket.requester_email ?? undefined} />
          <div className="flex items-center gap-2">
            {cost && <span className="text-sm font-medium text-foreground tabular-nums">{cost}</span>}
            <StatusBadge status={ticket.ticket_status} />
          </div>
        </div>
        <SheetDescription className="sr-only">
          {decided ? `Your decision on the request from ${requester}.` : `Review the request from ${requester} and approve or reject it.`}
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

          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {ticket.description?.trim() && <Answer label="Description" value={ticket.description} long />}
            {answers.map((a) => (
              <Answer key={a.key} label={a.label} value={a.value} long={a.long} />
            ))}
          </dl>

          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            {facts.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="flex min-h-5 items-center font-medium text-foreground tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Separator />

        {decided ? (
          <section aria-labelledby="approval-decision" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h3 id="approval-decision" className="text-sm font-semibold text-foreground">
                Decision
              </h3>
              <DecisionBadge decision={item.decision!} />
            </div>
            {item.reason ? (
              <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                {item.reason}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No note was added.</p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {item.approver_name ?? "You"} · {formatSast(item.decided_at)}. {who} can see this on their request.
            </p>
          </section>
        ) : (
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
                      <CircleCheck className="size-4 text-success" aria-hidden />
                      Approve
                    </FieldTitle>
                    <FieldDescription className="text-xs">
                      {ticket.assignee_name ? `Goes to ${ticket.assignee_name} to work on` : `Goes to the ${team} queue as New`}
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
                  {decision === "reject" ? "Reason" : "Note"}
                  <span className="font-normal text-muted-foreground">
                    · {decision === "reject" ? `${who} will see this` : `optional, ${who} will see this`}
                  </span>
                </FieldLabel>
                <Textarea
                  id="decision-text"
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="min-h-24"
                  placeholder={
                    decision === "reject" ? `Tell ${who} why, and what they can do instead` : "Anything they should know, e.g. when to expect it"
                  }
                  aria-invalid={showError || undefined}
                  aria-required={decision === "reject"}
                />
                {showError ? (
                  <FieldError>Add a reason so {who} knows why.</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {decision === "reject"
                      ? "Required when rejecting. Emailed and shown on the request."
                      : "Approving starts the SLA clock now. The note is emailed and shown on the request."}
                  </FieldDescription>
                )}
              </Field>
            )}
          </section>
        )}
      </div>

      <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {decided ? "Close" : "Cancel"}
        </Button>
        {!decided && (
          <Button
            type="submit"
            variant={decision === "reject" ? "destructive" : "default"}
            disabled={!decision || busy}
            className={cn("min-w-36", decision === "reject" && "bg-destructive text-primary-foreground hover:bg-destructive/90")}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {decision === "reject" ? "Reject request" : decision === "approve" ? "Approve request" : "Choose a decision"}
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

/** One answer from the request form: label above, value below (long text wraps) */
function Answer({ label, value, long }: { label: string; value: string; long?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm text-foreground [overflow-wrap:anywhere]",
          long ? "leading-relaxed whitespace-pre-wrap" : "font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
