import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/components/admin/roles";
import type { AccountStatus } from "@/components/admin/users";

/*
 * Badges for the admin pages (briefing p.60-62, p.67). Colour carries meaning only:
 * roles are indigo tints of rising strength, "Active" matches the green of a resolved
 * ticket, and the amber "No lead" flags a set-up gap (same amber as "Waiting on you").
 */

const ROLE_STYLE: Record<string, string> = {
  Employee: "border-border bg-muted text-foreground/70",
  Agent: "border-primary/15 bg-secondary text-secondary-foreground",
  "Department Lead": "border-chart-5 bg-chart-5/70 text-secondary-foreground",
  "System Admin": "border-foreground/85 bg-foreground/85 text-background",
  "Platform Admin": "border-foreground bg-foreground text-background",
};

export function RoleBadge({ role, className }: { role: string | null | undefined; className?: string }) {
  return (
    <Badge variant="outline" className={cn(ROLE_STYLE[role ?? ""] ?? ROLE_STYLE.Employee, className)}>
      {roleLabel(role)}
    </Badge>
  );
}

/** Account or department status: "Active" (green dot) or a quiet "Deactivated" / "Inactive" */
export function ActiveBadge({
  active,
  inactiveLabel = "Deactivated",
  className,
}: {
  active: boolean;
  inactiveLabel?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-background text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", active ? "bg-current" : "bg-muted-foreground/50")} />
      {active ? "Active" : inactiveLabel}
    </Badge>
  );
}

/** A department without a lead: needs the System Admin's attention */
export function NoLeadBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-amber-200 bg-amber-50 text-amber-800", className)}>
      No lead
    </Badge>
  );
}

/**
 * Account status on the Users table (briefing p.61): green "Active", a dashed indigo "Invited"
 * until their first sign-in, a quiet grey "Deactivated".
 */
export function AccountStatusBadge({ status, className }: { status: AccountStatus; className?: string }) {
  if (status === "invited") {
    return (
      <Badge variant="outline" className={cn("border-dashed border-primary/40 bg-background text-primary", className)}>
        <span aria-hidden className="size-1.5 rounded-full border border-current" />
        Invited
      </Badge>
    );
  }
  return <ActiveBadge active={status === "active"} className={className} />;
}

/** A category whose requests start in Pending approval: the same violet as that status (p.31, p.63) */
export function NeedsApprovalBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-violet-200 bg-violet-50 text-violet-700", className)}>
      Needs approval
    </Badge>
  );
}

/** A Sprint 2 stretch feature shown greyed out on a Sprint 1 page: "Coming with S11" */
export function ComingBadge({ feature, className }: { feature: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-amber-200 bg-amber-50 text-amber-800", className)}>
      Coming with {feature}
    </Badge>
  );
}
