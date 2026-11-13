import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { getNotificationPrefs, saveNotificationPrefs } from "@/services/notifications";
import { toApiError } from "@/services/apiClient";
import type { NotificationPref, NotificationType } from "@/types/api";
import { useApiData } from "@/hooks/useApiData";
import SectionCard from "@/components/app/SectionCard";
import ErrorState from "@/components/app/ErrorState";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/** One line under each type, so the switch says exactly what it changes */
const HINT: Partial<Record<NotificationType, string>> = {
  reply_added: "Someone replies on a request",
  status_changed: "A request changes status",
  assigned: "A ticket is assigned to you",
  approval_waiting: "A request waits for your approval",
  approval_decided: "Your request is approved or declined",
  sla_breached: "A ticket misses its response or resolution time",
  low_csat: "Someone rates your team 1 or 2 stars",
  csat_requested: "We ask how we did after a request closes",
  department_changed: "A request moves to another team",
};

/**
 * Notification settings on the profile (S9, briefing p.18, p.68): one Switch per type for email.
 * In-app notifications are always on, so turning email off never hides an update. Each switch
 * saves straight away and goes back if the save fails.
 */
export default function NotificationPrefsCard({ className }: { className?: string }) {
  const prefsQ = useApiData(() => getNotificationPrefs(), "notification-prefs");
  const [saving, setSaving] = useState<NotificationType | null>(null);

  const toggle = async (pref: NotificationPref, email: boolean) => {
    const before = prefsQ.data ?? [];
    const after = before.map((p) => (p.type === pref.type ? { ...p, email } : p));
    prefsQ.setData(after);
    setSaving(pref.type);
    try {
      const saved = await saveNotificationPrefs({ prefs: after.map(({ type, email: on }) => ({ type, email: on })) });
      // The server answers with every type; keep its word for it
      if (saved.length >= after.length) prefsQ.setData(saved);
      toast.success(email ? "Emails on" : "Emails off", {
        description: email ? `${pref.label}: email and in-app.` : `${pref.label}: in-app only.`,
      });
    } catch (error) {
      prefsQ.setData(before);
      toast.error("Couldn't save that setting", { description: toApiError(error).message });
    } finally {
      setSaving(null);
    }
  };

  return (
    <SectionCard
      className={className}
      title="Notifications"
      description="Choose which updates also come by email."
      footer={
        <span className="flex items-start gap-2">
          <BellRing className="mt-px size-3.5 shrink-0" aria-hidden />
          In-app is always on: turning email off never hides an update from your bell.
        </span>
      }
    >
      {prefsQ.loading ? (
        <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading your notification settings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-[18px] w-8 rounded-full" />
            </div>
          ))}
        </div>
      ) : !prefsQ.data ? (
        <ErrorState
          stacked
          title="Couldn't load your notification settings"
          description={prefsQ.error?.message}
          onRetry={prefsQ.reload}
          retrying={prefsQ.refreshing}
        />
      ) : prefsQ.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no updates to choose from for your role.</p>
      ) : (
        <ul className="flex flex-col" aria-label="Email notifications">
          {prefsQ.data.map((pref, index) => {
            const id = `notify-${pref.type}`;
            return (
              <li key={pref.type} className="flex flex-col">
                {index > 0 && <Separator className="my-4" />}
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent className="min-w-0">
                    <FieldLabel htmlFor={id} className="text-sm font-medium">
                      {pref.label}
                    </FieldLabel>
                    <FieldDescription className="text-xs">
                      {HINT[pref.type] && `${HINT[pref.type]} · `}
                      {pref.email ? "Email and in-app" : "In-app only"}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id={id}
                    checked={pref.email}
                    disabled={saving === pref.type}
                    onCheckedChange={(checked) => void toggle(pref, checked)}
                    aria-label={`Email me: ${pref.label}`}
                  />
                </Field>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
