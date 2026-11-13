import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  /** When true the confirm button stays disabled until some text is typed */
  required?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  /** Receives the trimmed text ("" when optional and left empty) */
  onConfirm: (text: string) => void | Promise<void>;
}

/**
 * Short form in a Dialog, used instead of window.prompt (briefing p.34 #4):
 * approval notes and rejection reasons.
 */
export default function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  required = false,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
}: ReasonDialogProps) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = required && text.trim().length === 0;

  const handleOpenChange = (next: boolean) => {
    // Start each time with an empty form
    if (!next) {
      setText("");
      setTouched(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (missing) return;
    await onConfirm(text.trim());
    setText("");
    setTouched(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <Field data-invalid={touched && missing ? true : undefined}>
            <FieldLabel htmlFor="reason-dialog-text">{label}</FieldLabel>
            <Textarea
              id="reason-dialog-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              rows={4}
              autoFocus
              aria-invalid={touched && missing ? true : undefined}
            />
            {touched && missing ? (
              <FieldError>A reason is required.</FieldError>
            ) : (
              !required && <FieldDescription>Optional.</FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
