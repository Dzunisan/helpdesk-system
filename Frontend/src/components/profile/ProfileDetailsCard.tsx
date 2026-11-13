import type { ReactNode } from "react";
import { PencilIcon } from "lucide-react";
import SectionCard from "@/components/app/SectionCard";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One description-list row: label column on the left, value beside it (briefing p.68).
 * Narrow cards stack the label above the value; the card is a container, so this follows
 * the card's width rather than the screen's.
 */
function DetailRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3.5 last:pb-0 @md:grid @md:grid-cols-[9rem_minmax(0,1fr)] @md:items-center @md:gap-6">
      <dt className="text-xs font-medium text-muted-foreground @md:text-sm @md:font-normal">{label}</dt>
      <dd className="flex min-w-0 items-center justify-between gap-3 text-sm text-foreground">
        <div className="min-w-0">{children}</div>
        {action}
      </dd>
    </div>
  );
}

export interface ProfileDetails {
  fullName: string;
  email: string;
  role: string;
  /** null while loading or when the user has no department */
  departmentName: string | null;
  hasDepartment: boolean;
  memberSince: string;
}

/** Avatar header + description list: name (editable), email (read-only), role, department, member since */
export default function ProfileDetailsCard({
  details,
  onEditName,
  className,
}: {
  details: ProfileDetails;
  onEditName: () => void;
  className?: string;
}) {
  const { fullName, email, role, departmentName, hasDepartment, memberSince } = details;
  const subtitle = [departmentName, role].filter(Boolean).join(" · ");

  return (
    <SectionCard className={className} contentClassName="@container flex flex-col gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <UserAvatar name={fullName} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{fullName}</h2>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <dl className="-mt-2 flex flex-col divide-y divide-border border-t border-border">
        <DetailRow
          label="Full name"
          action={
            <Button variant="ghost" size="sm" className="-my-1 h-9 shrink-0 text-primary hover:text-primary" onClick={onEditName}>
              <PencilIcon data-icon="inline-start" />
              Edit
              <span className="sr-only">your name</span>
            </Button>
          }
        >
          <span className="block truncate font-medium">{fullName}</span>
        </DetailRow>

        <DetailRow label="Work email">
          <span className="block font-medium break-all">{email || "—"}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Managed by your admin</span>
        </DetailRow>

        <DetailRow label="Role">
          <span className="font-medium">{role}</span>
        </DetailRow>

        <DetailRow label="Department">
          {hasDepartment ? (
            <span className={cn("font-medium", !departmentName && "text-muted-foreground")}>
              {departmentName ?? "—"}
            </span>
          ) : (
            <span className="text-muted-foreground">Not in a department</span>
          )}
        </DetailRow>

        <DetailRow label="Member since">
          <span className={cn("font-medium tabular-nums", memberSince === "—" && "text-muted-foreground")}>
            {memberSince}
          </span>
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

/** Same shape as the card, for the moment before the session is known */
export function ProfileDetailsSkeleton({ className }: { className?: string }) {
  return (
    <SectionCard className={className} contentClassName="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-5 border-t border-border pt-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
