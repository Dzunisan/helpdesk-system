import type { FormEvent, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** While true the drawer can't be dismissed (a save is running) */
  busy?: boolean;
  /** A <FormSheetBody>. It unmounts when the drawer closes, so each open starts with a fresh form. */
  children: ReactNode;
}

/**
 * Right-hand drawer for add/edit forms (briefing p.61 "Sheet (add / edit)").
 * Full width on phones, 28rem from sm.
 */
export default function FormSheet({ open, onOpenChange, busy, children }: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full sm:max-w-md data-[side=right]:sm:max-w-md">
        {children}
      </SheetContent>
    </Sheet>
  );
}

interface FormSheetBodyProps {
  /** Sentence case: "Add user", "Edit department" */
  title: ReactNode;
  /** One muted line under the title */
  description?: ReactNode;
  /** The submit button text: "Add user", "Save changes" */
  submitLabel: string;
  /** Disables the buttons and spins the submit icon */
  submitting?: boolean;
  /** A form-level error from the server, shown above the fields */
  error?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

/** Header, scrolling fields, and a footer pinned to the bottom with Cancel + one primary button */
export function FormSheetBody({ title, description, submitLabel, submitting, error, onSubmit, children }: FormSheetBodyProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-1 border-b border-border px-6 pt-6 pr-14 pb-5">
        <SheetTitle className="text-base font-semibold tracking-tight">{title}</SheetTitle>
        {description && <SheetDescription>{description}</SheetDescription>}
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>

      <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <SheetClose asChild>
          <Button type="button" variant="outline" className="h-10 sm:h-9" disabled={submitting}>
            Cancel
          </Button>
        </SheetClose>
        <Button type="submit" className="h-10 sm:h-9" disabled={submitting}>
          {submitting && <Spinner data-icon="inline-start" />}
          {submitLabel}
        </Button>
      </SheetFooter>
    </form>
  );
}
