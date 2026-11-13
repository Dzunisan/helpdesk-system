import { useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { createUser, updateUser } from "@/services/users";
import { toApiError } from "@/services/apiClient";
import type { Department, Role, User } from "@/types/api";
import FormSheet, { FormSheetBody } from "@/components/admin/FormSheet";
import { roleLabel } from "@/components/admin/roles";
import { fullNameOf, needsDepartment } from "@/components/admin/users";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Short labels for the segmented role choice (briefing p.61: Employee · Agent · Lead) */
const ROLE_SHORT: Record<string, string> = { Employee: "Employee", Agent: "Agent", "Department Lead": "Lead" };
const STAFF_ROLE_ORDER: Role[] = ["Employee", "Agent", "Department Lead"];

const ROLE_HELP: Record<string, string> = {
  Employee: "Employees submit requests and follow their progress.",
  Agent: "Agents claim and resolve their department's tickets. They only see that department's tickets.",
  "Department Lead": "Leads assign work and see their whole department. Appoint them on the Departments page.",
};

/** Shared by the toggle group items: the selected segment gets the indigo edge from the mock */
const SEGMENT =
  "h-10 sm:h-9 data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground data-[state=on]:shadow-[0_0_0_1px_var(--primary)]";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "name" | "surname" | "email" | "department";
type Errors = Partial<Record<FieldKey, string>>;

export interface UserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = "Add user"; a user = "Edit user" */
  user: User | null;
  /**
   * `staff`: System Admin adding Employees, Agents and Leads (role toggle + required department).
   * `admins`: Platform Admin adding System Admins (fixed role, no department).
   */
  scope: "staff" | "admins";
  /** Departments to pick from (scope "staff") */
  departments?: Pick<Department, "department_id" | "department_name" | "status">[];
  /** Called with the saved user so the list can update in place */
  onSaved: (user: User, created: boolean) => void;
}

/**
 * "Add user" / "Edit user" drawer (briefing p.61, S1). POST /api/users or PATCH /api/users/:id.
 * Role is a segmented choice; the department is required for Employees, Agents and Leads,
 * so a new agent can claim their department's tickets straight away.
 */
export default function UserSheet({ open, onOpenChange, ...props }: UserSheetProps) {
  const [busy, setBusy] = useState(false);
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} busy={busy}>
      <UserForm {...props} setBusy={setBusy} busy={busy} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}

type UserFormProps = Omit<UserSheetProps, "open" | "onOpenChange"> & {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
};

/** Mounted each time the drawer opens, so every open starts from the user as they are now */
function UserForm({ user, scope, departments = [], onSaved, busy, setBusy, onDone }: UserFormProps) {
  const isEdit = user !== null;
  const staff = scope === "staff";

  const [name, setName] = useState(user?.name ?? "");
  const [surname, setSurname] = useState(user?.surname ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? (staff ? "Employee" : "System Admin"));
  const [departmentId, setDepartmentId] = useState(user?.department_id != null ? String(user.department_id) : "");
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const askDepartment = staff && needsDepartment(role);
  // Inactive departments can't take new people, but an existing member keeps theirs on screen
  const choices = departments.filter((d) => d.status !== "inactive" || String(d.department_id) === departmentId);
  const leadsDepartment = isEdit && user.role === "Department Lead" && user.led_department_id != null;
  const ledName = leadsDepartment
    ? departments.find((d) => d.department_id === user.led_department_id)?.department_name ?? "a department"
    : null;

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter a first name.";
    if (!surname.trim()) next.surname = "Enter a surname.";
    if (!email.trim()) next.email = "Enter a work email.";
    else if (!EMAIL.test(email.trim())) next.email = "That doesn't look like an email address.";
    if (askDepartment && !departmentId) next.department = "Choose a department.";
    return next;
  };

  // Client errors appear after the first submit and then follow the typing; server errors until the field changes
  const errors: Errors = { ...serverErrors, ...(submitted ? validate() : {}) };
  const clearServer = (key: FieldKey) =>
    setServerErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(validate()).length > 0) return;

    const body = {
      name: name.trim(),
      surname: surname.trim(),
      email: email.trim(),
      role,
      department_id: askDepartment ? Number(departmentId) : null,
    };

    setBusy(true);
    try {
      const saved = isEdit ? await updateUser(user.user_id, body) : await createUser(body);
      const who = fullNameOf(saved);
      if (isEdit) toast.success(`${who} was updated`);
      else toast.success(`${who} was added`, { description: `A temporary password is on its way to ${saved.email}.` });
      onSaved(saved, !isEdit);
      onDone();
    } catch (err) {
      const apiError = toApiError(err, isEdit ? "Couldn't save the user." : "Couldn't add the user.");
      const message = apiError.message;
      if (apiError.status === 409 && /email/i.test(message)) setServerErrors({ email: message });
      else if (apiError.status === 400 && /department/i.test(message)) setServerErrors({ department: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  const noun = staff ? "user" : "system admin";

  return (
    <FormSheetBody
      title={isEdit ? `Edit ${fullNameOf(user)}` : `Add ${noun}`}
      description={
        isEdit ? `${roleLabel(user.role)} · ${user.email}` : "They'll get an email with a temporary password."
      }
      submitLabel={isEdit ? "Save changes" : `Add ${noun}`}
      submitting={busy}
      error={formError}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-6">
        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor="user-name">First name</FieldLabel>
            <Input
              id="user-name"
              autoComplete="off"
              className="h-10 sm:h-9"
              value={name}
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => setName(e.target.value)}
            />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field data-invalid={!!errors.surname || undefined}>
            <FieldLabel htmlFor="user-surname">Surname</FieldLabel>
            <Input
              id="user-surname"
              autoComplete="off"
              className="h-10 sm:h-9"
              value={surname}
              aria-invalid={!!errors.surname || undefined}
              onChange={(e) => setSurname(e.target.value)}
            />
            <FieldError>{errors.surname}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="user-email">Work email</FieldLabel>
          <Input
            id="user-email"
            type="email"
            autoComplete="off"
            className="h-10 sm:h-9"
            placeholder="name@mzansifreight.co.za"
            value={email}
            aria-invalid={!!errors.email || undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              clearServer("email");
            }}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        {staff ? (
          <Field>
            <FieldLabel id="user-role-label">Role</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-labelledby="user-role-label"
              value={role}
              onValueChange={(next) => next && setRole(next as Role)}
              className="grid w-full grid-cols-3"
            >
              {STAFF_ROLE_ORDER.map((r) => (
                <ToggleGroupItem key={r} value={r} aria-label={roleLabel(r)} className={SEGMENT}>
                  {ROLE_SHORT[r]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">
              {leadsDepartment && role !== "Department Lead"
                ? `${user.name} leads ${ledName}. Appoint someone else there first, then change the role.`
                : ROLE_HELP[role]}
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel>Role</FieldLabel>
            <p className="text-sm text-foreground">{roleLabel("System Admin")}</p>
            <FieldDescription className="text-xs">
              System admins set up departments, staff, categories and SLA targets. They don&apos;t see ticket contents.
            </FieldDescription>
          </Field>
        )}

        {askDepartment && (
          <Field data-invalid={!!errors.department || undefined}>
            <FieldLabel htmlFor="user-department">Department</FieldLabel>
            <Select
              value={departmentId}
              onValueChange={(next) => {
                setDepartmentId(next);
                clearServer("department");
              }}
            >
              <SelectTrigger id="user-department" className="h-10 w-full sm:h-9" aria-invalid={!!errors.department || undefined}>
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
                Required for employees, agents and leads. Agents only see this department&apos;s tickets.
              </FieldDescription>
            )}
          </Field>
        )}

        {!isEdit && (
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3.5 py-3 text-xs text-muted-foreground">
            <Info aria-hidden className="mt-px size-3.5 shrink-0" />
            <p className="text-pretty">
              They&apos;ll show as <span className="font-medium text-foreground">Invited</span> until they first sign in,
              and choose their own password then.
            </p>
          </div>
        )}
      </FieldGroup>
    </FormSheetBody>
  );
}
