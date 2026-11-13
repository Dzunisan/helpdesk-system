import type { TicketStatus } from "@/types/api";
import { firstNameOf } from "@/lib/format";

/** "Sets Waiting on employee", "Sets Resolved", "Reply only" (S7, p.49) */
export function macroEffect(setStatus: TicketStatus | null, internal = false): string {
  const status = setStatus ? `Sets ${setStatus}` : "Reply only";
  return internal ? `Internal note · ${status}` : status;
}

/** Plain word search (no fuzzy letters): title matches rank above body matches. keywords = [title, body]. */
export function matchMacro(_value: string, search: string, keywords: string[] = []): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const [title = "", body = ""] = keywords.map((k) => k.toLowerCase());
  if (words.every((w) => title.includes(w))) return 1;
  if (words.every((w) => title.includes(w) || body.includes(w))) return 0.5;
  return 0;
}

export interface PreviewContext {
  ref: string;
  title: string;
  requesterName: string | null;
  agentName: string | null;
}

/** The preview fills the placeholders the way the server will (GET /macros/:id/render) */
export function previewOf(body: string, ctx: PreviewContext): string {
  return body
    .replaceAll("{{requester.first_name}}", firstNameOf(ctx.requesterName, "there"))
    .replaceAll("{{ticket.ref}}", ctx.ref)
    .replaceAll("{{ticket.title}}", ctx.title)
    .replaceAll("{{agent.first_name}}", firstNameOf(ctx.agentName, "the team"));
}
