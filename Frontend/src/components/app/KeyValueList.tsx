import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /** React key when the label is not a string */
  key?: string;
}

interface KeyValueListProps {
  /** Rows to show; or pass <KeyValueRow> children instead */
  items?: KeyValueItem[];
  /** `rows` (default): hairline between rows. `plain`: no dividers, tighter. */
  variant?: "rows" | "plain";
  className?: string;
  children?: ReactNode;
}

/**
 * Property/detail panel: muted label on the left, value on the right (briefing p.41 "Details", p.48 "Properties").
 * Values can be text, a StatusBadge, PriorityBadge, SlaChip, UserAvatar or a Select.
 * @example <KeyValueList items={[{ label: "Reference", value: <TicketRef id={t.ticket_id} /> }, { label: "Status", value: <StatusBadge status={t.ticket_status} /> }]} />
 */
export default function KeyValueList({ items, variant = "rows", className, children }: KeyValueListProps) {
  return (
    <dl className={cn("flex flex-col text-sm", variant === "rows" ? "divide-y divide-border" : "gap-2", className)}>
      {items?.map((item, index) => (
        <KeyValueRow key={item.key ?? (typeof item.label === "string" ? item.label : index)} label={item.label} dense={variant === "plain"}>
          {item.value}
        </KeyValueRow>
      ))}
      {children}
    </dl>
  );
}

/** One label/value row inside a KeyValueList */
export function KeyValueRow({
  label,
  children,
  dense,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  /** Less vertical padding (used by variant="plain") */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        dense ? "py-0.5" : "py-2.5 first:pt-0 last:pb-0",
        className,
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center justify-end text-right font-medium text-foreground tabular-nums [&>*]:min-w-0">
        {children}
      </dd>
    </div>
  );
}
