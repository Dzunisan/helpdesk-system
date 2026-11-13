import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Department, DepartmentPayload } from "@/hooks/useDepartments";
import FormSheet, { FormSheetBody } from "@/components/admin/FormSheet";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface DepartmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The department being edited; null for "New department" */
  department: Department | null;
  /** Same calls as before (useDepartments createDepartment / updateDepartment) */
  onCreate: (data: DepartmentPayload) => Promise<unknown>;
  onUpdate: (id: string | number, data: DepartmentPayload) => Promise<unknown>;
  submitting?: boolean;
}

/**
 * "New department" / "Edit department" drawer (briefing p.62): name, description and status.
 * The lead is appointed with the Appoint lead dialog, which only offers eligible people (S1).
 */
export default function DepartmentSheet({ open, onOpenChange, submitting, ...form }: DepartmentSheetProps) {
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} busy={submitting}>
      <DepartmentForm {...form} submitting={submitting} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}

type DepartmentFormProps = Omit<DepartmentSheetProps, "open" | "onOpenChange"> & { onDone: () => void };

/** Mounted each time the drawer opens, so it always starts from the department as it is now */
function DepartmentForm({ department, onCreate, onUpdate, submitting, onDone }: DepartmentFormProps) {
  const isEdit = department !== null;

  const [name, setName] = useState(department?.department_name ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [status, setStatus] = useState(department?.status === "inactive" ? "inactive" : "active");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameError = !submitted
    ? undefined
    : !trimmed
      ? "Enter a department name."
      : trimmed.length < 2
        ? "Use at least 2 characters."
        : trimmed.length > 100
          ? "Keep it under 100 characters."
          : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) return;

    const payload: DepartmentPayload = {
      name: trimmed,
      description: description.trim(),
      ...(isEdit ? {} : { leadId: null }),
      status,
    };
    try {
      if (isEdit) {
        await onUpdate(department.department_id, payload);
        toast.success(`${trimmed} was updated`);
      } else {
        await onCreate(payload);
        toast.success(`${trimmed} was created`, { description: "It's ready for agents and requests." });
      }
      onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't save the department. Please try again.");
    }
  };

  return (
    <FormSheetBody
      title={isEdit ? "Edit department" : "New department"}
      description={
        isEdit
          ? `Change the name, description or status of ${department.department_name}.`
          : "Each department is a private queue. Appoint its lead from the row menu once it exists."
      }
      submitLabel={isEdit ? "Save changes" : "Create department"}
      submitting={submitting}
      error={serverError}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-6">
        <Field data-invalid={!!nameError || undefined}>
          <FieldLabel htmlFor="department-name">Name</FieldLabel>
          <Input
            id="department-name"
            autoComplete="off"
            maxLength={100}
            placeholder="e.g. Facilities"
            className="h-10 sm:h-9"
            value={name}
            aria-invalid={!!nameError || undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError>{nameError}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="department-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id="department-description"
            rows={3}
            placeholder="What people come to this department for"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FieldDescription className="text-xs">One line about what this department looks after.</FieldDescription>
        </Field>

        {isEdit && (
          <Field>
            <FieldLabel id="department-status-label">Status</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-labelledby="department-status-label"
              value={status}
              onValueChange={(next) => next && setStatus(next)}
              className="grid w-full grid-cols-2"
            >
              {[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ].map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="h-10 sm:h-9 data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground data-[state=on]:shadow-[0_0_0_1px_var(--primary)]"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">Inactive departments stay in the list, greyed out.</FieldDescription>
          </Field>
        )}
      </FieldGroup>
    </FormSheetBody>
  );
}
