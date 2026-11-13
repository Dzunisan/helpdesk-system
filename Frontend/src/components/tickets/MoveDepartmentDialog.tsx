import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Info, Lock, RotateCw } from "lucide-react";
import { listDepartments } from "@/services/departments";
import { listDepartmentCategories, moveTicketDepartment } from "@/services/admin";
import { toApiError } from "@/services/apiClient";
import type { Category, Department, Ticket } from "@/types/api";
import { firstNameOf, formatTicketRef } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface MoveDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  /** After the move: the old department can't see the ticket any more (404), so leave the page */
  onMoved: (departmentName: string) => void;
}

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** The public message, pre-filled (p.50); kept as typed once the agent edits it */
const defaultMessage = (requester: string, department: string) =>
  `Hi ${requester}, I've passed this to the ${department} team, who look after this. They'll be in touch shortly.`;

/**
 * S12 move to another department (briefing p.20, p.50): the department, then a category inside it
 * (the same list employees use), an amber internal reason and a public message to the requester,
 * with the consequences stated before the button: New and unassigned there, due times kept, and
 * this department loses access.
 */
export default function MoveDepartmentDialog({ open, onOpenChange, ticket, onMoved }: MoveDepartmentDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        {/* Mounted per open: a fresh form every time */}
        <MoveForm ticket={ticket} onMoved={onMoved} onCancel={() => onOpenChange(false)} busy={busy} setBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  ticket,
  onMoved,
  onCancel,
  busy,
  setBusy,
}: {
  ticket: Ticket;
  onMoved: (departmentName: string) => void;
  onCancel: () => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const ref = formatTicketRef(ticket.ticket_id);
  const requester = firstNameOf(ticket.requester_name, "there");
  const current = ticket.department_name ?? "this department";

  const [departments, setDepartments] = useState<Load<Department[]>>({ status: "loading" });
  const [categories, setCategories] = useState<Load<Category[]> | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [messageEdited, setMessageEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departmentsAttempt, setDepartmentsAttempt] = useState(0);
  const categoriesRequest = useRef(0);

  useEffect(() => {
    let live = true;
    listDepartments({ limit: 100 })
      .then((r) => {
        if (!live) return;
        const others = r.departments.filter((d) => d.department_id !== ticket.ticket_department_id && d.status !== "inactive");
        setDepartments({ status: "ready", data: others });
      })
      .catch((err) => live && setDepartments({ status: "error", message: toApiError(err).message }));
    return () => {
      live = false;
    };
  }, [ticket.ticket_department_id, departmentsAttempt]);

  const department = departments.status === "ready" ? departments.data.find((d) => String(d.department_id) === departmentId) : undefined;

  /** The categories of the chosen department (S12 picker); a newer choice wins over a slow answer */
  const loadCategories = (id: string) => {
    const request = ++categoriesRequest.current;
    setCategories({ status: "loading" });
    listDepartmentCategories(Number(id))
      .then((data) => request === categoriesRequest.current && setCategories({ status: "ready", data }))
      .catch((err) => request === categoriesRequest.current && setCategories({ status: "error", message: toApiError(err).message }));
  };

  const chooseDepartment = (value: string) => {
    setDepartmentId(value);
    setCategoryId("");
    setError(null);
    loadCategories(value);
    const name = departments.status === "ready" ? departments.data.find((d) => String(d.department_id) === value)?.department_name : undefined;
    if (name && !messageEdited) setMessage(defaultMessage(requester, name));
  };

  const missingReason = reason.trim().length === 0;
  const target = department?.department_name;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!departmentId || !categoryId || missingReason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await moveTicketDepartment(ticket.ticket_id, {
        department_id: Number(departmentId),
        category_id: Number(categoryId),
        reason: reason.trim(),
        message: message.trim() || undefined,
      });
      onMoved(target ?? "the new department");
    } catch (err) {
      setError(toApiError(err, "Couldn't move the ticket.").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5">
      <DialogHeader className="flex-row items-start gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Move {ref} to another department</DialogTitle>
          <DialogDescription className="line-clamp-2">
            “{ticket.title}” · currently {current}
          </DialogDescription>
        </div>
      </DialogHeader>

      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={touched && !departmentId ? true : undefined}>
            <FieldLabel htmlFor="move-department">Department</FieldLabel>
            {departments.status === "error" ? (
              <LoadProblem message="Couldn't load departments." onRetry={() => {
                  setDepartments({ status: "loading" });
                  setDepartmentsAttempt((n) => n + 1);
                }}
              />
            ) : (
              <Select value={departmentId} onValueChange={chooseDepartment} disabled={departments.status === "loading" || busy}>
                <SelectTrigger id="move-department" className="w-full" aria-invalid={touched && !departmentId ? true : undefined}>
                  <SelectValue placeholder={departments.status === "loading" ? "Loading…" : "Choose a department"} />
                </SelectTrigger>
                <SelectContent>
                  {departments.status === "ready" && departments.data.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">No other active department.</div>
                  ) : (
                    departments.status === "ready" &&
                    departments.data.map((d) => (
                      <SelectItem key={d.department_id} value={String(d.department_id)}>
                        <Building2 aria-hidden />
                        {d.department_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {touched && !departmentId && <FieldError>Choose where it goes.</FieldError>}
          </Field>

          <Field data-invalid={touched && departmentId && !categoryId ? true : undefined}>
            <FieldLabel htmlFor="move-category">{target ? `Category in ${target}` : "Category"}</FieldLabel>
            {categories?.status === "error" ? (
              <LoadProblem message="Couldn't load its categories." onRetry={() => loadCategories(departmentId)} />
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId} disabled={!departmentId || categories?.status !== "ready" || busy}>
                <SelectTrigger id="move-category" className="w-full" aria-invalid={touched && departmentId && !categoryId ? true : undefined}>
                  <SelectValue
                    placeholder={!departmentId ? "Choose a department first" : categories?.status === "loading" ? "Loading…" : "Choose a category"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories?.status === "ready" && categories.data.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">{target} has no active categories.</div>
                  ) : (
                    categories?.status === "ready" &&
                    categories.data.map((c) => (
                      <SelectItem key={c.category_id} value={String(c.category_id)}>
                        {c.category_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {touched && departmentId && !categoryId && <FieldError>Choose a category.</FieldError>}
          </Field>
        </div>

        <Field data-invalid={touched && missingReason ? true : undefined}>
          <FieldLabel htmlFor="move-reason" className="gap-1.5">
            <Lock className="size-3.5 text-warning" aria-hidden />
            Reason
            <span className="font-normal text-muted-foreground">· internal, staff only</span>
          </FieldLabel>
          <Textarea
            id="move-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why it doesn't belong here, e.g. Not an IT issue: aircon leak on the 3rd floor."
            rows={2}
            maxLength={1000}
            disabled={busy}
            aria-invalid={touched && missingReason ? true : undefined}
            className="min-h-16 border-warning-border bg-warning-muted focus-visible:border-warning-border focus-visible:ring-warning-border/40 dark:bg-warning-muted"
          />
          {touched && missingReason ? <FieldError>A reason is required. Only staff see it.</FieldError> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="move-message" className="gap-1.5">
            Message to {requester}
            <span className="font-normal text-muted-foreground">· public, emailed</span>
          </FieldLabel>
          <Textarea
            id="move-message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setMessageEdited(true);
            }}
            placeholder={target ? defaultMessage(requester, target) : `Choose a department and we'll draft a note to ${requester}.`}
            rows={3}
            maxLength={2000}
            disabled={busy}
            className="min-h-20"
          />
          <FieldDescription>Shown on {requester}'s request with “Moved to {target ?? "…"}”.</FieldDescription>
        </Field>
      </FieldGroup>

      <Alert className="border-border bg-muted/40">
        <Info aria-hidden />
        <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
          The ticket becomes <strong className="font-semibold text-foreground">New</strong> and unassigned in {target ?? "the new department"}.
          Due times stay the same because {requester} has already been waiting.{" "}
          <strong className="font-semibold text-foreground">{current} loses access</strong> once it moves.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || departments.status !== "ready"}>
          {busy ? <Spinner data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" />}
          {target ? `Move to ${target}` : "Move ticket"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LoadProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 text-sm text-destructive">
      <span className="truncate">{message}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry} className="h-7 text-destructive hover:text-destructive">
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>
    </div>
  );
}
