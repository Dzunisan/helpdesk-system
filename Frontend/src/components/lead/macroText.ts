import type { TicketStatus } from "@/types/api";

export const REPLY_ONLY = "reply-only";

/** "Then set status": the moves a reply can make, applied with the normal transition rules (p.16) */
export const MACRO_STATUS_OPTIONS: { value: TicketStatus | typeof REPLY_ONLY; label: string }[] = [
  { value: REPLY_ONLY, label: "Reply only" },
  { value: "Open", label: "Open" },
  { value: "Waiting on employee", label: "Waiting on employee" },
  { value: "Resolved", label: "Resolved" },
];

export const thenLabel = (status: TicketStatus | null) => `Then: ${status ?? "Reply only"}`;
