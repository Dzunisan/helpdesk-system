import type { CategoryField } from "@/types/api";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

interface ExtraFieldInputProps {
  field: CategoryField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
}

/**
 * One of the category's own questions (briefing p.39), rendered from its `fields` JSON:
 * text -> Input, number -> Input with the unit inside ("ZAR"), long_text -> Textarea, date -> date Input.
 */
export default function ExtraFieldInput({ field, value, onChange, error, className }: ExtraFieldInputProps) {
  const id = `extra-${field.key}`;
  const describedBy = error ? `${id}-error` : field.help ? `${id}-help` : undefined;
  const common = {
    id,
    name: field.key,
    value,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };

  let control;
  if (field.type === "long_text") {
    control = (
      <Textarea {...common} onChange={(e) => onChange(e.target.value)} className="min-h-24 scroll-mt-28 resize-y" />
    );
  } else if (field.type === "number") {
    control = (
      <InputGroup className="h-10 scroll-mt-28" data-invalid={error ? true : undefined}>
        <InputGroupInput
          {...common}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          className="tabular-nums"
        />
        {field.unit && (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs">{field.unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    );
  } else {
    control = (
      <Input
        {...common}
        type={field.type === "date" ? "date" : "text"}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="h-10 scroll-mt-28"
      />
    );
  }

  return (
    <Field data-invalid={error ? true : undefined} className={cn(field.type === "long_text" && "md:col-span-2", className)}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {!field.required && <span className="font-normal text-muted-foreground">(optional)</span>}
      </FieldLabel>
      {control}
      {error ? (
        <FieldError id={`${id}-error`} className="text-xs">
          {error}
        </FieldError>
      ) : (
        field.help && (
          <FieldDescription id={`${id}-help`} className="text-xs">
            {field.help}
          </FieldDescription>
        )
      )}
    </Field>
  );
}
