import type { CategoryField, Ticket } from "@/types/api";
import { formatAnswer, humanizeKey } from "@/components/portal/portalText";

export interface RequestAnswer {
  key: string;
  label: string;
  value: string;
  /** Long answers (a business reason) read better on their own line */
  long: boolean;
}

/**
 * Every answer the employee gave on the category form (S5 extra fields), in the form's order,
 * labelled the way the form labelled them. Unknown keys keep a readable label.
 */
export function requestAnswers(ticket: Ticket, fields: CategoryField[] = []): RequestAnswer[] {
  const extra = ticket.extra_fields ?? {};
  const known = fields.map((f) => f.key);
  const keys = [...known.filter((k) => k in extra), ...Object.keys(extra).filter((k) => !known.includes(k))];
  return keys
    .filter((key) => extra[key] !== null && extra[key] !== "")
    .map((key) => {
      const field = fields.find((f) => f.key === key);
      const value = formatAnswer(extra[key], field);
      return { key, label: field?.label ?? humanizeKey(key), value, long: field?.type === "long_text" || value.length > 60 };
    });
}

const RAND = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });

/** The request's cost for the list column: "R3 960 / yr", "R18 500", or null when there isn't one */
export function requestCost(ticket: Ticket, fields: CategoryField[] = []): string | null {
  const extra = ticket.extra_fields ?? {};
  const key =
    fields.find((f) => f.type === "number" && (f.unit === "ZAR" || /cost|price|amount/i.test(f.key)) && extra[f.key] != null)?.key ??
    Object.keys(extra).find((k) => /cost|price|amount/i.test(k) && extra[k] != null);
  if (!key) return null;
  const n = Number(extra[key]);
  if (!Number.isFinite(n)) return String(extra[key]);
  return `R${RAND.format(n)}${/year|annual/i.test(key) ? " / yr" : ""}`;
}
