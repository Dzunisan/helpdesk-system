import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useUsers } from "@/context/UsersContext";
import type { Department, DepartmentPayload } from "@/hooks/useDepartments";
import FormSheet, { FormSheetBody } from "@/components/admin/FormSheet";
import { fullNameOf, userIdOf } from "@/components/admin/useAccountActions";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const NO_LEAD = "none";

interface DepartmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The department being edited; null for "New department" */
  department: Department | null;
  /** Every department, to show who already leads one */
  departments: Department[];
  /** Same calls as before (useDepartments createDepartment / updateDepartment) */
  onCreate: (data: DepartmentPayload) => Promise<unknown>;
  onUpdate: (id: string | number, data: DepartmentPayload) => Promise<unknown>;
  submitting?: boolean;
}

/** "New department" / "Edit department" drawer (briefing p.62) */
export default function DepartmentSheet({ open, onOpenChange, submitting, ...form }: DepartmentSheetProps) {
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} busy={submitting}>
      <DepartmentForm {...form} submitting={submitting} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}

type DepartmentFormProps = Omit<DepartmentSheetProps, "open" | "onOpenChange"> & { onDone: () => void };

/** Mounted each time the drawer opens, so it always starts from the department as it is now */
function DepartmentForm({ department, departments, onCreate, onUpdate, submitting, onDone }: DepartmentFormProps) {
  const isEdit = department !== null;
  const { users } = useUsers();

  const [name, setName] = useState(department?.department_name ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [leadId, setLeadId] = useState(
    department?.lead_id != null && department.lead_id !== "" ? String(department.lead_id) : NO_LEAD,
  );
  const [status, setStatus] = useState(department?.status === "inactive" ? "inactive" : "active");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /** Lead id -> the other department they already lead */
  const leading = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) {
      if (d.lead_id != null && String(d.department_id) !== String(department?.department_id)) {
        map.set(String(d.lead_id), d.department_name);
      }
    }
    return map;
  }, [departments, department]);

  const leads = useMemo(
    () =>
      users
        .filter((u) => u.role === "Department Lead" && u.active)
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b))),
    [users],
  );
  const currentLeadMissing = leadId !== NO_LEAD && !leads.some((l) => userIdOf(l) === leadId);

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
      leadId: leadId === NO_LEAD ? null : leadId,
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
        isEdit ? `Change the details, lead or status of ${department.department_name}.` : "Each department is a private queue with its own lead and agents."
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

        <Field>
          <FieldLabel htmlFor="department-lead">Department lead</FieldLabel>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger id="department-lead" className="h-10 w-full sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value={NO_LEAD}>
                <span className="text-muted-foreground">No lead yet</span>
              </SelectItem>
              {(leads.length > 0 || currentLeadMissing) && <SelectSeparator />}
              {currentLeadMissing && (
                <SelectItem value={leadId}>{department?.departmentLead || "Current lead"}</SelectItem>
              )}
              {leads.map((lead) => {
                const id = userIdOf(lead);
                const other = leading.get(id);
                return (
                  <SelectItem key={id} value={id}>
                    {fullNameOf(lead)}
                    {other && <span className="text-xs text-muted-foreground">· leads {other}</span>}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <FieldDescription className="text-xs">
            {leads.length === 0
              ? "No one has the Department lead role yet. Add one on the Users page first."
              : "Only people with the Department lead role are listed."}
          </FieldDescription>
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
