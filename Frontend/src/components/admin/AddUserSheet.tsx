import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useUsers, type UserRole } from "@/context/UsersContext";
import type { Department } from "@/hooks/useDepartments";
import FormSheet, { FormSheetBody } from "@/components/admin/FormSheet";
import { roleLabel } from "@/components/admin/roles";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Short labels for the segmented role choice */
const ROLE_SHORT: Record<string, string> = { Employee: "Employee", Agent: "Agent", "Department Lead": "Lead" };
/** Most people added are employees, so that is the default */
const ROLE_ORDER: UserRole[] = ["Employee", "Agent", "Department Lead"];

type Errors = Partial<Record<"name" | "surname" | "email" | "department", string>>;

interface AddUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Departments to pick from. Pass them for staff (System Admin adding leads, agents,
   * employees); leave out for System Admins, who don't belong to a department.
   */
  departments?: Department[];
}

/**
 * "Add user" / "Add system admin" drawer (briefing p.61). Same endpoint as before
 * (POST /api/users/create via UsersContext); the server emails a temporary password.
 */
export default function AddUserSheet({ open, onOpenChange, departments }: AddUserSheetProps) {
  const { actionLoading } = useUsers();
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} busy={actionLoading}>
      <AddUserForm departments={departments} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}

/** Mounted each time the drawer opens, so every open starts with an empty form */
function AddUserForm({ departments, onDone }: { departments?: Department[]; onDone: () => void }) {
  const { createUser, actionLoading, error: serverError, allowedRoles } = useUsers();
  const roles = ROLE_ORDER.filter((r) => allowedRoles.includes(r));
  const singleRole = allowedRoles.length === 1 ? allowedRoles[0] : null;
  const askDepartment = departments !== undefined;
  const activeDepartments = (departments ?? []).filter((d) => d.status !== "inactive");

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(singleRole ?? "Employee");
  const [departmentId, setDepartmentId] = useState("");
  // Field errors show after the first submit; the server error only after this form has called the server
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter a first name.";
    if (!surname.trim()) next.surname = "Enter a surname.";
    if (!email.trim()) next.email = "Enter a work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That doesn't look like an email address.";
    if (askDepartment && !departmentId) next.department = "Choose a department.";
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate()).length > 0) return;

    setSent(true);
    const created = await createUser({
      name: name.trim(),
      surname: surname.trim(),
      email: email.trim(),
      role,
      ...(askDepartment ? { department_id: Number(departmentId) } : {}),
    });

    if (created) {
      toast.success(`${name.trim()} ${surname.trim()} was added`, {
        description: `A temporary password is on its way to ${email.trim()}.`,
      });
      onDone();
    }
  };

  // Errors appear after the first submit attempt, then update as the fields change
  const errors: Errors = submitted ? validate() : {};

  const noun = singleRole ? roleLabel(singleRole).toLowerCase() : "user";

  return (
    <FormSheetBody
      title={`Add ${noun}`}
      description="They'll get an email with a temporary password."
      submitLabel={`Add ${noun}`}
      submitting={actionLoading}
      error={sent ? serverError : null}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-6">
        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor="add-user-name">First name</FieldLabel>
            <Input
              id="add-user-name"
              autoComplete="off"
              className="h-10 sm:h-9"
              value={name}
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => setName(e.target.value)}
            />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field data-invalid={!!errors.surname || undefined}>
            <FieldLabel htmlFor="add-user-surname">Surname</FieldLabel>
            <Input
              id="add-user-surname"
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
          <FieldLabel htmlFor="add-user-email">Work email</FieldLabel>
          <Input
            id="add-user-email"
            type="email"
            autoComplete="off"
            className="h-10 sm:h-9"
            placeholder="name@mzansifreight.co.za"
            value={email}
            aria-invalid={!!errors.email || undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        {roles.length > 1 ? (
          <Field>
            <FieldLabel id="add-user-role-label">Role</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-labelledby="add-user-role-label"
              value={role}
              onValueChange={(next) => next && setRole(next as UserRole)}
              className="grid w-full grid-cols-3"
            >
              {roles.map((r) => (
                <ToggleGroupItem
                  key={r}
                  value={r}
                  aria-label={roleLabel(r)}
                  className="h-10 sm:h-9 data-[state=on]:z-10 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground data-[state=on]:shadow-[0_0_0_1px_var(--primary)]"
                >
                  {ROLE_SHORT[r] ?? r}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">
              {role === "Department Lead"
                ? "Leads approve requests and see their team's workload."
                : role === "Agent"
                  ? "Agents claim and resolve their department's tickets."
                  : "Employees submit requests and follow their progress."}
            </FieldDescription>
          </Field>
        ) : (
          singleRole && (
            <Field>
              <FieldLabel>Role</FieldLabel>
              <p className="text-sm text-foreground">{roleLabel(singleRole)}</p>
              <FieldDescription className="text-xs">
                System admins set up departments and staff. They don&apos;t see ticket contents.
              </FieldDescription>
            </Field>
          )
        )}

        {askDepartment && (
          <Field data-invalid={!!errors.department || undefined}>
            <FieldLabel htmlFor="add-user-department">Department</FieldLabel>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger
                id="add-user-department"
                className="h-10 w-full sm:h-9"
                aria-invalid={!!errors.department || undefined}
              >
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {activeDepartments.map((d) => (
                  <SelectItem key={d.department_id} value={String(d.department_id)}>
                    {d.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department ? (
              <FieldError>{errors.department}</FieldError>
            ) : (
              <FieldDescription className="text-xs">
                Everyone needs a department to submit or claim tickets.
              </FieldDescription>
            )}
          </Field>
        )}
      </FieldGroup>
    </FormSheetBody>
  );
}
