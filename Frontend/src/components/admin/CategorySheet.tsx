import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCategory, updateCategory } from "@/services/categories";
import { toApiError } from "@/services/apiClient";
import {
  TICKET_PRIORITIES,
  type Category,
  type CategoryField,
  type CategoryKind,
  type CreateCategoryRequest,
  type Department,
  type TicketPriority,
} from "@/types/api";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import FormSheet, { FormSheetBody } from "@/components/admin/FormSheet";
import { CategoryIcon } from "@/components/admin/CategoryIconTile";
import { CATEGORY_ICONS, CATEGORY_ICON_NAMES } from "@/lib/categoryIcons";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const SEGMENT =
  "h-10 sm:h-9 data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground data-[state=on]:shadow-[0_0_0_1px_var(--primary)]";

const FIELD_TYPES: { value: CategoryField["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "long_text", label: "Long text" },
  { value: "date", label: "Date" },
];

/** A field being edited. `locked` keys belong to saved fields: old tickets store answers under them. */
interface DraftField {
  uid: number;
  key: string;
  locked: boolean;
  label: string;
  type: CategoryField["type"];
  required: boolean;
  help: string;
  unit: string;
}

/** "Estimated cost per year (R)" -> "estimated_cost_per_year_r" */
const toKey = (label: string): string => {
  const key = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[0-9]/.test(key) ? `field_${key}` : key;
};

/** Keys for new fields follow their label, made unique against every other field */
const withKeys = (fields: DraftField[]): DraftField[] => {
  const taken = new Set(fields.filter((f) => f.locked).map((f) => f.key));
  return fields.map((f) => {
    if (f.locked) return f;
    const base = toKey(f.label) || "field";
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return { ...f, key };
  });
};

type Errors = Partial<Record<"name" | "department", string>> & { fields?: Record<number, string> };

export interface CategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = "Add category" */
  category: Category | null;
  departments: Pick<Department, "department_id" | "department_name" | "status">[];
  /** Pre-selected department for a new category (the page's department filter) */
  defaultDepartmentId?: number | null;
  onSaved: (category: Category, created: boolean) => void;
}

/**
 * Side panel editor for a category (briefing p.63, S5): where it routes, its default priority,
 * whether it needs approval, and the extra fields that drive the New request form.
 * There is no delete: switching Active off hides it from the form and old tickets keep it.
 */
export default function CategorySheet({ open, onOpenChange, ...props }: CategorySheetProps) {
  const [busy, setBusy] = useState(false);
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} busy={busy} size="wide">
      <CategoryForm {...props} busy={busy} setBusy={setBusy} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}

type CategoryFormProps = Omit<CategorySheetProps, "open" | "onOpenChange"> & {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
};

let nextUid = 1;

function CategoryForm({ category, departments, defaultDepartmentId, onSaved, busy, setBusy, onDone }: CategoryFormProps) {
  const isEdit = category !== null;

  const [name, setName] = useState(category?.category_name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "fix");
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "circle-help");
  const [departmentId, setDepartmentId] = useState(
    category ? String(category.department_id) : defaultDepartmentId != null ? String(defaultDepartmentId) : "",
  );
  const [priority, setPriority] = useState<TicketPriority>(category?.default_priority ?? "Normal");
  const [needsApproval, setNeedsApproval] = useState(category?.needs_approval ?? false);
  const [active, setActive] = useState(category?.active ?? true);
  const [fields, setFields] = useState<DraftField[]>(() =>
    (category?.fields ?? []).map((f) => ({
      uid: nextUid++,
      key: f.key,
      locked: true,
      label: f.label,
      type: f.type,
      required: f.required,
      help: f.help ?? "",
      unit: f.unit ?? "",
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const [nameConflict, setNameConflict] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const keyed = withKeys(fields);
  const choices = departments.filter((d) => d.status !== "inactive" || String(d.department_id) === departmentId);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter a name.";
    else if (name.trim().length > 100) next.name = "Keep it under 100 characters.";
    if (!departmentId) next.department = "Choose where these requests go.";
    const fieldErrors: Record<number, string> = {};
    for (const f of keyed) if (!f.label.trim()) fieldErrors[f.uid] = "Give this field a label.";
    if (Object.keys(fieldErrors).length) next.fields = fieldErrors;
    return next;
  };
  const errors: Errors = submitted ? validate() : {};
  const nameError = errors.name ?? nameConflict ?? undefined;

  const patchField = (uid: number, patch: Partial<DraftField>) =>
    setFields((list) => list.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  const moveField = (index: number, by: -1 | 1) =>
    setFields((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  const addField = () =>
    setFields((list) => [
      ...list,
      { uid: nextUid++, key: "", locked: false, label: "", type: "text", required: false, help: "", unit: "" },
    ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const found = validate();
    if (found.name || found.department || found.fields) return;

    const body: CreateCategoryRequest = {
      category_name: name.trim(),
      department_id: Number(departmentId),
      kind,
      icon,
      description: description.trim() || null,
      default_priority: priority,
      needs_approval: needsApproval,
      active,
      fields: keyed.map((f) => ({
        key: f.key,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.help.trim() ? { help: f.help.trim() } : {}),
        ...(f.type === "number" && f.unit.trim() ? { unit: f.unit.trim() } : {}),
      })),
    };

    setBusy(true);
    try {
      const saved = isEdit ? await updateCategory(category.category_id, body) : await createCategory(body);
      toast.success(isEdit ? `${saved.category_name} was saved` : `${saved.category_name} was added`, {
        description: saved.active
          ? `New requests go to ${saved.department_name}.`
          : "It's inactive, so it stays off the New request form.",
      });
      onSaved(saved, !isEdit);
      onDone();
    } catch (err) {
      const apiError = toApiError(err, "Couldn't save the category.");
      if (apiError.status === 409) setNameConflict(apiError.message);
      else setFormError(apiError.errors.length > 1 ? apiError.errors.join(" ") : apiError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheetBody
      title={isEdit ? category.category_name : "Add category"}
      description={
        kind === "fix" ? 'Shown under "Something is broken"' : 'Shown under "I need something"'
      }
      submitLabel={isEdit ? "Save category" : "Add category"}
      submitting={busy}
      error={formError}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="category-name">Name</FieldLabel>
            <Input
              id="category-name"
              autoComplete="off"
              maxLength={100}
              placeholder="e.g. Software purchase"
              className="h-10 sm:h-9"
              value={name}
              aria-invalid={!!nameError || undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameConflict(null);
              }}
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="category-icon">Icon</FieldLabel>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger id="category-icon" aria-label="Icon" className="h-10 w-20 sm:h-9">
                <SelectValue>
                  <CategoryIcon name={icon} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="max-h-72">
                {CATEGORY_ICON_NAMES.map((key) => (
                  <SelectItem key={key} value={key}>
                    <CategoryIcon name={key} />
                    {CATEGORY_ICONS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field>
          <FieldLabel id="category-kind-label">Shown under</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-labelledby="category-kind-label"
            value={kind}
            onValueChange={(next) => next && setKind(next as CategoryKind)}
            className="grid w-full grid-cols-2"
          >
            <ToggleGroupItem value="fix" className={SEGMENT}>
              Something is broken
            </ToggleGroupItem>
            <ToggleGroupItem value="request" className={SEGMENT}>
              I need something
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="category-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id="category-description"
            autoComplete="off"
            maxLength={200}
            placeholder="One line under the name on the tile"
            className="h-10 sm:h-9"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field data-invalid={!!errors.department || undefined}>
          <FieldLabel htmlFor="category-department">Routes to department</FieldLabel>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger id="category-department" className="h-10 w-full sm:h-9" aria-invalid={!!errors.department || undefined}>
              <SelectValue placeholder="Choose a department" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {choices.map((d) => (
                <SelectItem key={d.department_id} value={String(d.department_id)}>
                  {d.department_name}
                  {d.status === "inactive" && <span className="text-xs text-muted-foreground">· inactive</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.department ? (
            <FieldError>{errors.department}</FieldError>
          ) : (
            <FieldDescription className="text-xs">
              The server routes every request in this category here, whatever the browser sends.
            </FieldDescription>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="category-priority">Default priority</FieldLabel>
            <Select value={priority} onValueChange={(next) => setPriority(next as TicketPriority)}>
              <SelectTrigger id="category-priority" className="h-10 w-full sm:h-9">
                <SelectValue>
                  <PriorityBadge priority={priority} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <PriorityBadge priority={p} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Approver</FieldLabel>
            <p className="flex h-10 items-center text-sm text-muted-foreground sm:h-9">
              {needsApproval ? "Department lead" : "No approval step"}
            </p>
          </Field>
        </div>

        <Field
          orientation="horizontal"
          className={cn(
            "rounded-lg border px-4 py-3 transition-colors",
            needsApproval ? "border-violet-200 bg-violet-50" : "border-border",
          )}
        >
          <FieldContent>
            <FieldLabel htmlFor="category-approval" className={cn(needsApproval && "text-violet-800")}>
              Needs approval
            </FieldLabel>
            <FieldDescription className={cn("text-xs", needsApproval && "text-violet-700")}>
              {needsApproval
                ? active
                  ? "Starts as Pending approval, not in the queue. Approvals arrive in Sprint 2 (S6): keep it inactive until then."
                  : "Starts as Pending approval, not in the queue. The department lead approves (S6, Sprint 2)."
                : "Requests go straight into the department's queue as New."}
            </FieldDescription>
          </FieldContent>
          <Switch id="category-approval" checked={needsApproval} onCheckedChange={setNeedsApproval} />
        </Field>

        <Field orientation="horizontal" className="rounded-lg border border-border px-4 py-3">
          <FieldContent>
            <FieldLabel htmlFor="category-active">Active</FieldLabel>
            <FieldDescription className="text-xs">
              {active
                ? "Shown on the New request form."
                : "Hidden from the New request form. Old tickets keep this category."}
            </FieldDescription>
          </FieldContent>
          <Switch id="category-active" checked={active} onCheckedChange={setActive} />
        </Field>

        <FieldSet className="gap-3">
          <FieldLegend variant="label" className="mb-0">
            Extra fields on the form
          </FieldLegend>
          <FieldDescription className="-mt-1 text-xs">
            Asked after the title and description. Required fields are checked by the server too.
          </FieldDescription>

          {keyed.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              No extra fields. Employees only give a title and a description.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {keyed.map((f, index) => (
                <FieldEditor
                  key={f.uid}
                  field={f}
                  index={index}
                  count={keyed.length}
                  error={errors.fields?.[f.uid]}
                  onChange={(patch) => patchField(f.uid, patch)}
                  onMove={(by) => moveField(index, by)}
                  onRemove={() => setFields((list) => list.filter((x) => x.uid !== f.uid))}
                />
              ))}
            </ol>
          )}

          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addField}>
            <Plus data-icon="inline-start" />
            Add field
          </Button>
        </FieldSet>
      </FieldGroup>
    </FormSheetBody>
  );
}

interface FieldEditorProps {
  field: DraftField;
  index: number;
  count: number;
  error?: string;
  onChange: (patch: Partial<DraftField>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

/** One extra field: label, type, required, optional help text and unit (numbers) */
function FieldEditor({ field: f, index, count, error, onChange, onMove, onRemove }: FieldEditorProps) {
  const id = `extra-field-${f.uid}`;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-2">
        <Field data-invalid={!!error || undefined} className="min-w-0 flex-1 gap-1.5">
          <FieldLabel htmlFor={`${id}-label`} className="sr-only">
            Field {index + 1} label
          </FieldLabel>
          <Input
            id={`${id}-label`}
            autoComplete="off"
            maxLength={80}
            placeholder="Label, e.g. Software name"
            className="h-10 sm:h-9"
            value={f.label}
            aria-invalid={!!error || undefined}
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <Select value={f.type} onValueChange={(type) => onChange({ type: type as CategoryField["type"] })}>
          <SelectTrigger aria-label={`Field ${index + 1} type`} className="h-10 w-30 shrink-0 sm:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-muted-foreground hover:text-destructive sm:size-9"
          aria-label={`Remove ${f.label || `field ${index + 1}`}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <div className={cn("grid gap-2", f.type === "number" && "grid-cols-[minmax(0,1fr)_6rem]")}>
        <Input
          aria-label={`Field ${index + 1} help text`}
          autoComplete="off"
          maxLength={160}
          placeholder="Help text under the input (optional)"
          className="h-9 text-[13px]"
          value={f.help}
          onChange={(e) => onChange({ help: e.target.value })}
        />
        {f.type === "number" && (
          <Input
            aria-label={`Field ${index + 1} unit`}
            autoComplete="off"
            maxLength={8}
            placeholder="Unit, ZAR"
            className="h-9 text-[13px]"
            value={f.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`${id}-required`}
            size="sm"
            checked={f.required}
            onCheckedChange={(required) => onChange({ required })}
          />
          <FieldLabel htmlFor={`${id}-required`} className="text-[13px] font-normal">
            Required
          </FieldLabel>
          <span className="truncate font-mono text-[11px] text-muted-foreground" title="Answers are saved under this key">
            · {f.key}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={index === 0}
            aria-label="Move up"
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={index === count - 1}
            aria-label="Move down"
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
        </div>
      </div>
    </li>
  );
}
