import { useState, type FormEvent } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface EditNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialSurname: string;
  /** Saves the trimmed names; resolves true on success (the dialog then closes) */
  onSave: (name: string, surname: string) => Promise<boolean>;
  saving: boolean;
  /** Server error from the last attempt */
  error: string | null;
}

/** Short form for the one editable profile field (briefing p.32: Dialog for short forms) */
export default function EditNameDialog({ open, onOpenChange, ...rest }: EditNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts from the saved name */}
        {open && <EditNameForm {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function EditNameForm({
  initialName,
  initialSurname,
  onSave,
  saving,
  error,
}: Omit<EditNameDialogProps, "open" | "onOpenChange">) {
  const [name, setName] = useState(initialName);
  const [surname, setSurname] = useState(initialSurname);
  const [touched, setTouched] = useState(false);

  const nameMissing = !name.trim();
  const surnameMissing = !surname.trim();
  const unchanged = name.trim() === initialName.trim() && surname.trim() === initialSurname.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameMissing || surnameMissing || saving) return;
    await onSave(name.trim(), surname.trim());
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Edit your name</DialogTitle>
        <DialogDescription>This is how agents and colleagues see you on requests.</DialogDescription>
      </DialogHeader>

      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={(touched && nameMissing) || undefined}>
          <FieldLabel htmlFor="profile-name">First name</FieldLabel>
          <Input
            id="profile-name"
            autoComplete="given-name"
            className="h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={(touched && nameMissing) || undefined}
            disabled={saving}
            autoFocus
          />
          {touched && nameMissing && <FieldError>Enter your first name.</FieldError>}
        </Field>
        <Field data-invalid={(touched && surnameMissing) || undefined}>
          <FieldLabel htmlFor="profile-surname">Surname</FieldLabel>
          <Input
            id="profile-surname"
            autoComplete="family-name"
            className="h-10"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            aria-invalid={(touched && surnameMissing) || undefined}
            disabled={saving}
          />
          {touched && surnameMissing && <FieldError>Enter your surname.</FieldError>}
        </Field>
      </FieldGroup>

      {error && (
        <Alert role="alert" variant="destructive" className="border-destructive/25 bg-destructive/5">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={saving}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving || unchanged} className={saving ? "disabled:opacity-100" : undefined}>
          {saving && <Spinner data-icon="inline-start" />}
          {saving ? "Saving…" : "Save name"}
        </Button>
      </DialogFooter>
    </form>
  );
}
