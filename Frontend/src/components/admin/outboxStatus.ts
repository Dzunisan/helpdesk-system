import { CircleCheck, CircleX, Clock, FlaskConical } from "lucide-react";
import type { OutboxStatus } from "@/types/api";

/** Outbox delivery states (briefing p.18): green sent, rose failed, violet simulated (no SMTP), amber queued */
export const OUTBOX_STATUS: Record<OutboxStatus, { className: string; icon: typeof Clock; hint: string }> = {
  SENT: { className: "border-success-border bg-success-muted text-success", icon: CircleCheck, hint: "Delivered to the mail server" },
  FAILED: { className: "border-destructive/25 bg-destructive/5 text-destructive", icon: CircleX, hint: "The mail server refused it" },
  SIMULATED: {
    className: "border-pending-border bg-pending-muted text-pending",
    icon: FlaskConical,
    hint: "Email isn't set up, so it was logged, not sent",
  },
  QUEUED: { className: "border-warning-border bg-warning-muted text-warning-strong", icon: Clock, hint: "Waiting to go out" },
};
