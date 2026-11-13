import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Paperclip, SearchX, Send } from "lucide-react";
import { listCategories } from "@/services/categories";
import { listSlaPolicies } from "@/services/slaPolicies";
import { createTicket } from "@/services/tickets";
import { toApiError } from "@/services/apiClient";
import type { Category, CategoryField, TicketImpact } from "@/types/api";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import NewRequestSteps from "@/components/request/NewRequestSteps";
import CategorySummary from "@/components/request/CategorySummary";
import ExtraFieldInput from "@/components/request/ExtraFieldInput";
import WhatHappensNext from "@/components/request/WhatHappensNext";
import { useApiData } from "@/hooks/useApiData";
import { IMPACT_OPTIONS } from "@/components/portal/portalText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

const TITLE_MAX = 255;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;

type Errors = Record<string, string>;

interface FormState {
  title: string;
  description: string;
  impact: TicketImpact | "";
  extra: Record<string, string>;
}

const EMPTY: FormState = { title: "", description: "", impact: "", extra: {} };

/** Same rules as the server (docs/api-sprint-1.md S5), so most mistakes never leave the browser */
function validate(form: FormState, fields: CategoryField[]): Errors {
  const errors: Errors = {};
  const title = form.title.trim();
  const description = form.description.trim();
  if (!title) errors.title = "Add a short summary.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the summary to ${TITLE_MAX} characters or fewer.`;
  if (description.length < DESCRIPTION_MIN) errors.description = `Tell us a little more: at least ${DESCRIPTION_MIN} characters.`;
  else if (description.length > DESCRIPTION_MAX) errors.description = `Keep it under ${DESCRIPTION_MAX} characters.`;

  for (const field of fields) {
    const value = (form.extra[field.key] ?? "").trim();
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === "number") {
      const n = Number(value.replace(/[\s,]/g, ""));
      if (!Number.isFinite(n)) errors[field.key] = "Enter a number, e.g. 3960.";
      else if (n < 0) errors[field.key] = "Enter an amount of 0 or more.";
    }
    if (field.type === "date" && Number.isNaN(new Date(value).getTime())) errors[field.key] = "Choose a valid date.";
  }
  return errors;
}

/** The answers as the API expects them: numbers as numbers, empty optional answers left out */
function extraFieldsBody(form: FormState, fields: CategoryField[]) {
  const body: Record<string, string | number | null> = {};
  for (const field of fields) {
    const value = (form.extra[field.key] ?? "").trim();
    if (!value) continue;
    body[field.key] = field.type === "number" ? Number(value.replace(/[\s,]/g, "")) : value;
  }
  return body;
}

/**
 * New request, step 2: details (briefing p.39, S5) at /employee/submit-request/:categoryId.
 * The category's own questions come from its `fields` JSON; "How is this affecting you?" records
 * impact without letting the employee set the priority.
 */
export default function NewRequestDetails() {
  const { categoryId } = useParams();
  const categories = useApiData(() => listCategories(), "categories");
  const policies = useApiData(() => listSlaPolicies(), "sla-policies");

  const category = categories.data?.categories.find((c) => String(c.category_id) === categoryId) ?? null;
  const firstReplyMins = policies.data?.find((p) => p.priority === category?.default_priority)?.first_response_mins;

  const steps = <NewRequestSteps current={1} />;

  if (categories.loading) {
    return (
      <div className="flex flex-col gap-8">
        {steps}
        <DetailsSkeleton />
      </div>
    );
  }

  if (categories.error && !categories.data) {
    return (
      <div className="flex flex-col gap-8">
        {steps}
        <ErrorState title="Couldn't load this form" onRetry={categories.reload} retrying={categories.refreshing} />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="flex flex-col gap-8">
        {steps}
        <EmptyState
          variant="card"
          icon={SearchX}
          title="This category isn't available"
          description="It may have been switched off. Choose another one and we'll route your request."
          action={
            <Button asChild>
              <Link to="/employee/submit-request">Choose a category</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Keyed by category so switching category starts a clean form
  return <DetailsForm key={category.category_id} category={category} firstReplyMins={firstReplyMins} steps={steps} />;
}

function DetailsForm({
  category,
  firstReplyMins,
  steps,
}: {
  category: Category;
  firstReplyMins?: number;
  steps: ReactNode;
}) {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fields = category.fields ?? [];

  const update = (next: FormState) => {
    setForm(next);
    // After the first submit, errors follow the input so they clear as soon as they're fixed
    if (attempted) setErrors(validate(next, fields));
  };

  const focusFirstError = (found: Errors) => {
    const order = ["title", ...fields.map((f) => f.key), "description"];
    const first = order.find((key) => found[key]);
    if (!first) return;
    const id = first === "title" ? "request-title" : first === "description" ? "request-description" : `extra-${first}`;
    const el = formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const found = validate(form, fields);
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstError(found);

    setSubmitting(true);
    try {
      const ticket = await createTicket({
        category_id: category.category_id,
        title: form.title.trim(),
        description: form.description.trim(),
        impact: form.impact || undefined,
        extra_fields: extraFieldsBody(form, fields),
      });
      navigate(`/employee/tickets/${ticket.ticket_id}/submitted`, { state: { ticket } });
    } catch (err) {
      const apiError = toApiError(err, "Couldn't submit your request.");
      const serverErrors = { ...apiError.fieldErrors };
      if (Object.keys(serverErrors).length > 0) {
        setErrors(serverErrors);
        focusFirstError(serverErrors);
        toast.error("Check the highlighted answers", { description: Object.values(serverErrors)[0] });
      } else {
        toast.error("Couldn't submit your request", { description: apiError.message });
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {steps}

      <PageHeader
        title="Tell us what's going on"
        description="A clear summary and a few details help the team sort it out first time."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <SectionCard>
          <form ref={formRef} onSubmit={submit} noValidate aria-label="Request details" className="flex flex-col gap-8">
            <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-6">
              <CategorySummary category={category} />

              <Field data-invalid={errors.title ? true : undefined}>
                <FieldLabel htmlFor="request-title">Short summary</FieldLabel>
                <Input
                  id="request-title"
                  value={form.title}
                  onChange={(e) => update({ ...form, title: e.target.value })}
                  placeholder={category.kind === "fix" ? "e.g. VPN drops every 10 minutes on home fibre" : "Say what you need in a few words"}
                  autoComplete="off"
                  maxLength={TITLE_MAX + 20}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? "request-title-error" : "request-title-help"}
                  className="h-10 scroll-mt-28"
                />
                {errors.title ? (
                  <FieldError id="request-title-error" className="text-xs">{errors.title}</FieldError>
                ) : (
                  <FieldDescription id="request-title-help" className="text-xs">
                    One line the team will see in their queue.
                  </FieldDescription>
                )}
              </Field>

              {fields.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  {fields.map((field) => (
                    <ExtraFieldInput
                      key={field.key}
                      field={field}
                      value={form.extra[field.key] ?? ""}
                      error={errors[field.key]}
                      onChange={(value) => update({ ...form, extra: { ...form.extra, [field.key]: value } })}
                    />
                  ))}
                </div>
              )}

              <Field data-invalid={errors.description ? true : undefined}>
                <FieldLabel htmlFor="request-description">
                  {category.kind === "fix" ? "What's happening?" : "Anything else we should know?"}
                </FieldLabel>
                <Textarea
                  id="request-description"
                  value={form.description}
                  onChange={(e) => update({ ...form, description: e.target.value })}
                  placeholder={
                    category.kind === "fix"
                      ? "What happened, when it started, and anything you've already tried."
                      : "Why you need it and anything that helps the team decide."
                  }
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? "request-description-error" : "request-description-help"}
                  className="min-h-32 scroll-mt-28 resize-y"
                />
                {errors.description ? (
                  <FieldError id="request-description-error" className="text-xs">{errors.description}</FieldError>
                ) : (
                  <FieldDescription id="request-description-help" className="text-xs">
                    No need to include your password. The team will never ask for it.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel id="impact-label">
                  How is this affecting you? <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={form.impact}
                  onValueChange={(value) => update({ ...form, impact: value as TicketImpact | "" })}
                  aria-labelledby="impact-label"
                  // The middle label is the longest: give it more room at 390px so it never touches its borders
                  className="grid w-full grid-cols-[1fr_1.4fr_1fr] sm:grid-cols-3"
                >
                  {IMPACT_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      aria-label={`${option.label}: ${option.hint}`}
                      className="h-11 min-w-0 px-2 text-[13px] whitespace-normal leading-tight data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground sm:h-10 sm:px-3 sm:text-sm"
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription className="text-xs">
                  This helps the team judge urgency. They set the priority.
                </FieldDescription>
              </Field>

              {/* Sprint 2 (S14): attachments drop zone, png / jpg / pdf / docx up to 5 MB. Slot kept here. */}
              <div
                aria-disabled="true"
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground"
              >
                <Paperclip className="size-4 shrink-0" aria-hidden />
                Attachments are coming soon. For now, describe the screenshot or error in words.
              </div>
            </fieldset>

            <Separator />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="outline" size="lg" className="h-11 w-full sm:h-10 sm:w-auto">
                <Link to={`/employee/submit-request?selected=${category.category_id}`}>
                  <ChevronLeft data-icon="inline-start" />
                  Back
                </Link>
              </Button>
              <Button type="submit" size="lg" disabled={submitting} className="h-11 w-full sm:h-10 sm:w-auto">
                {submitting ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </SectionCard>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24" aria-label="About your request">
          {/* Sprint 2 (S13): "Before you submit, these might help" help-article suggestions go here */}
          <WhatHappensNext category={category} firstReplyMins={firstReplyMins} />
        </aside>
      </div>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-background p-6">
          <Skeleton className="h-18 w-full rounded-xl" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
