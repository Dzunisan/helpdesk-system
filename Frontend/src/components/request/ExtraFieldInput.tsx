import type { CategoryField } from "@/types/api";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import DatePicker from "@/components/app/DatePicker";

interface ExtraFieldInputProps {
  field: CategoryField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
}

/** "3960" -> "3 960", "12500.5" -> "12 500.5"; anything that isn't a plain amount stays as typed */
function groupThousands(value: string): string {
  const plain = value.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(plain)) return value;
  const [whole, cents] = plain.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cents !== undefined ? `${grouped}.${cents}` : grouped;
}

/**
 * One of the category's own questions (briefing p.39), rendered from its `fields` JSON:
 * text -> Input, number -> Input with the unit inside ("ZAR"), long_text -> Textarea, date -> DatePicker
 * (Popover + Calendar).
 */
export default function ExtraFieldInput({ field, value, onChange, error, className }: ExtraFieldInputProps) {
  const id = `extra-${field.key}`;
  // Rand amounts get a standard hint when the category gives none
  const help = field.help ?? (field.type === "number" && field.unit === "ZAR" ? "In rand, including VAT." : undefined);
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
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
    const rand = field.unit === "ZAR";
    control = (
      <InputGroup className="h-10 scroll-mt-28" data-invalid={error ? true : undefined}>
        {rand && (
          <InputGroupAddon align="inline-start">
            <InputGroupText className="text-sm font-medium text-foreground">R</InputGroupText>
          </InputGroupAddon>
        )}
        <InputGroupInput
          {...common}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={rand ? "0" : undefined}
          onChange={(e) => onChange(e.target.value)}
          // Rand amounts read like the briefing: "3 960" (spaces between thousands)
          onBlur={rand ? () => onChange(groupThousands(value)) : undefined}
          className="tabular-nums"
        />
        {field.unit && !rand && (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs">{field.unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    );
  } else if (field.type === "date") {
    control = (
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        fromDate={new Date()}
        aria-invalid={common["aria-invalid"]}
        aria-describedby={describedBy}
        className="scroll-mt-28"
      />
    );
  } else {
    control = (
      <Input
        {...common}
        type="text"
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
        help && (
          <FieldDescription id={`${id}-help`} className="text-xs">
            {help}
          </FieldDescription>
        )
      )}
    </Field>
  );
}
