import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Send, Users } from "lucide-react";
import { useDepartments } from "@/hooks/useDepartments";
import * as ticketService from "@/services/ticketService";
import { formatTicketRef } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import DepartmentPicker, { DepartmentPickerSkeleton } from "@/components/request/DepartmentPicker";
import WhatHappensNext, { RequestTips } from "@/components/request/WhatHappensNext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

type FormData = { department_id: string; title: string; description: string };
type FormErrors = Partial<Record<keyof FormData, string>>;

const TITLE_MIN = 5;
const TITLE_MAX = 255;
const DESCRIPTION_MIN = 15;

// Employees never choose a priority: staff set it after triage (the server ignores it from Employees)
function validate(data: FormData): FormErrors {
  const e: FormErrors = {};
  const title = data.title.trim();
  const description = data.description.trim();
  if (!data.department_id) e.department_id = "Choose the team that should handle this.";
  if (title.length < TITLE_MIN) e.title = `Add a short summary of at least ${TITLE_MIN} characters.`;
  else if (title.length > TITLE_MAX) e.title = `Keep the summary to ${TITLE_MAX} characters or fewer.`;
  if (description.length < DESCRIPTION_MIN)
    e.description = `Tell us a little more: at least ${DESCRIPTION_MIN} characters.`;
  return e;
}

/** A numbered group inside the form: "1 Which team can help?" */
function FormSection({
  step,
  title,
  description,
  titleId,
  children,
}: {
  step: number;
  title: string;
  description: string;
  titleId?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
          {step}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-6 sm:pl-9">{children}</div>
    </section>
  );
}

export default function EmployeeSubmitRequest() {
  const navigate = useNavigate();
  const { departments, loading: deptLoading, error: deptError, isRefetching, refetch } = useDepartments();

  const [formData, setFormData] = useState<FormData>({ department_id: "", title: "", description: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const firstTileRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const activeDepartments = useMemo(() => departments.filter((d) => d.status === "active"), [departments]);

  // With a single team there is nothing to choose; otherwise the employee picks (pre-selecting the
  // first team sent tickets to the wrong queue, briefing p.38)
  const onlyTeamId = activeDepartments.length === 1 ? String(activeDepartments[0].department_id) : "";
  const current: FormData = { ...formData, department_id: formData.department_id || onlyTeamId };

  const selectedDepartment = activeDepartments.find((d) => String(d.department_id) === current.department_id);

  const update = (field: keyof FormData, value: string) => {
    const next = { ...current, [field]: value };
    setFormData(next);
    // After the first submit, errors follow the input so they clear as soon as they're fixed
    if (attempted) setErrors(validate(next));
  };

  const addRequest = async (ev: FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    const found = validate(current);
    setErrors(found);
    if (found.department_id) return firstTileRef.current?.focus();
    if (found.title) return titleRef.current?.focus();
    if (found.description) return descriptionRef.current?.focus();

    setSubmitting(true);
    try {
      const ticket = await ticketService.createTicket({
        title: current.title.trim(),
        description: current.description.trim(),
        department_id: current.department_id ? Number(current.department_id) : undefined,
      });
      const team = selectedDepartment?.department_name;
      toast.success("Request submitted", {
        description: ticket?.ticket_id
          ? `${formatTicketRef(ticket.ticket_id)} is with ${team ?? "the team"}. We'll email you updates.`
          : "We'll email you updates.",
      });
      setSubmitted(true);
      setTimeout(() => navigate("/employee/my-requests"), 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit request.";
      toast.error("Couldn't submit your request", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || submitted;

  let teamPicker: ReactNode;
  if (deptLoading) {
    teamPicker = <DepartmentPickerSkeleton />;
  } else if (deptError) {
    teamPicker = (
      <ErrorState title="Couldn't load the teams" onRetry={() => refetch()} retrying={isRefetching} />
    );
  } else if (activeDepartments.length === 0) {
    teamPicker = (
      <EmptyState
        variant="card"
        size="compact"
        icon={Users}
        title="No teams are taking requests"
        description="Please try again later, or contact your manager."
      />
    );
  } else {
    teamPicker = (
      <Field data-invalid={!!errors.department_id || undefined} className="gap-3">
        <DepartmentPicker
          id="department-select"
          ref={firstTileRef}
          departments={activeDepartments}
          value={current.department_id}
          onValueChange={(v) => update("department_id", v)}
          invalid={!!errors.department_id}
          aria-labelledby="team-heading"
          aria-describedby={errors.department_id ? "department-error" : undefined}
        />
        {errors.department_id && <FieldError id="department-error" className="text-xs">{errors.department_id}</FieldError>}
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        back={{ to: "/employee/my-requests", label: "My requests" }}
        title="New request"
        description="Tell us what you need and we'll get it to the right people."
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2">
          <form onSubmit={addRequest} noValidate className="flex flex-col gap-8" aria-label="New request">
            {/* Locked while sending so nothing changes under the request in flight */}
            <fieldset disabled={busy} className="flex min-w-0 flex-col gap-8">
              <FormSection
                step={1}
                titleId="team-heading"
                title="Which team can help?"
                description="Pick the closest match. If it's not theirs, they'll pass it on."
              >
                {teamPicker}
              </FormSection>

              <Separator />

              <FormSection
                step={2}
                title="Describe your request"
                description="A clear summary and a few details help the team sort it out first time."
              >
                <Field data-invalid={!!errors.title || undefined}>
                  <FieldLabel htmlFor="ticket-title">Short summary</FieldLabel>
                  <Input
                    id="ticket-title"
                    ref={titleRef}
                    value={formData.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="e.g. VPN won't connect from home"
                    autoComplete="off"
                    maxLength={TITLE_MAX + 50}
                    aria-invalid={!!errors.title || undefined}
                    aria-describedby={errors.title ? "ticket-title-error" : "ticket-title-help"}
                    className="h-10 scroll-mt-28"
                  />
                  {errors.title ? (
                    <FieldError id="ticket-title-error" className="text-xs">{errors.title}</FieldError>
                  ) : (
                    <FieldDescription id="ticket-title-help" className="text-xs">
                      One line the team will see in their queue.
                    </FieldDescription>
                  )}
                </Field>

                <Field data-invalid={!!errors.description || undefined}>
                  <FieldLabel htmlFor="ticket-description">Details</FieldLabel>
                  <Textarea
                    id="ticket-description"
                    ref={descriptionRef}
                    value={formData.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="What happened, when it started, and anything you've already tried."
                    aria-invalid={!!errors.description || undefined}
                    aria-describedby={errors.description ? "ticket-description-error" : "ticket-description-help"}
                    className="min-h-40 scroll-mt-28 resize-y"
                  />
                  {errors.description ? (
                    <FieldError id="ticket-description-error" className="text-xs">{errors.description}</FieldError>
                  ) : (
                    <FieldDescription id="ticket-description-help" className="text-xs">
                      No need to include your password. The team will never ask for it.
                    </FieldDescription>
                  )}
                </Field>
              </FormSection>
            </fieldset>

            <Separator />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link to="/employee/my-requests">Cancel</Link>
              </Button>
              <Button
                type="submit"
                id="submit-ticket-btn"
                size="lg"
                disabled={busy}
                className="w-full sm:w-auto"
              >
                {submitting ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                {submitting ? "Submitting…" : submitted ? "Submitted" : "Submit request"}
              </Button>
            </div>
          </form>
        </SectionCard>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8" aria-label="About your request">
          <WhatHappensNext departmentName={selectedDepartment?.department_name} />
          <RequestTips />
        </aside>
      </div>
    </div>
  );
}
