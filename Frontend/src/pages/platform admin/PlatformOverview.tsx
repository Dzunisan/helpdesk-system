import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { useUsers } from "@/context/UsersContext";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge } from "@/components/admin/AdminBadges";
import { fullNameOf, userIdOf } from "@/components/admin/useAccountActions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_7.5rem_6.5rem] sm:items-center sm:gap-6";

/** What a Platform Admin account can and can't do (the server enforces each line) */
const SCOPE: { can: boolean; text: string }[] = [
  { can: true, text: "Add System Admins, and deactivate or reactivate them" },
  { can: false, text: "Read tickets, comments or internal notes" },
  { can: false, text: "Manage departments or staff (System Admins do that)" },
];

/**
 * Platform Admin home (briefing p.66). States the rule up front: this account
 * manages the system (System Admin accounts), never tickets, comments or notes.
 */
export default function PlatformOverview() {
  // For a Platform Admin, UsersContext is already scoped to System Admins
  const { users: systemAdmins, loading, error, fetchUsers } = useUsers();
  const firstLoad = loading && systemAdmins.length === 0;
  const loadFailed = !!error && !loading && systemAdmins.length === 0;
  const active = systemAdmins.filter((u) => u.active).length;
  const deactivated = systemAdmins.length - active;
  const sorted = [...systemAdmins].sort(
    (a, b) => Number(b.active) - Number(a.active) || fullNameOf(a).localeCompare(fullNameOf(b)),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Platform overview" description="Helpdesk for Mzansi Freight" />

      <Alert className="rounded-xl border-foreground bg-foreground px-5 py-3.5 text-background">
        <ShieldCheck aria-hidden />
        <AlertDescription className="text-background/85">
          <span className="font-medium text-background">Platform Admins manage the system, not the data.</span>{" "}
          Tickets, comments and notes are not visible from this account.
        </AlertDescription>
      </Alert>

      {loadFailed ? (
        <ErrorState title="Couldn't load the system admins" onRetry={() => fetchUsers()} retrying={loading} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              label="System admins"
              icon={ShieldCheck}
              to="/platform-admin/users"
              loading={firstLoad}
              className="col-span-2 lg:col-span-1"
              value={systemAdmins.length}
              hint="People who configure Helpdesk"
            />
            <StatCard
              label="Active"
              icon={UserRoundCheck}
              loading={firstLoad}
              value={active}
              hint="Can sign in now"
            />
            <StatCard
              label="Deactivated"
              icon={UserRoundX}
              loading={firstLoad}
              value={deactivated}
              hint={deactivated === 0 ? "None blocked" : "Can't sign in"}
            />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <SectionCard
              title="System admins"
              flush
              action={
                <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary hover:text-primary">
                  <Link to="/platform-admin/users">
                    Manage
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              }
            >
              <ListHeaderRow grid={GRID}>
                <span>Name</span>
                <span>Status</span>
                <span>Added</span>
              </ListHeaderRow>
              {firstLoad ? (
                <LoadingRows grid={GRID} breakpoint="sm" columns={["avatar", "badge", "meta"]} />
              ) : sorted.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  size="compact"
                  title="No system admins yet"
                  description="Add someone to set up departments and staff."
                  action={
                    <Button asChild variant="outline">
                      <Link to="/platform-admin/users">Add system admin</Link>
                    </Button>
                  }
                />
              ) : (
                <ListBody>
                  {sorted.map((admin) => (
                    <ListRow key={userIdOf(admin)} grid={GRID} className="py-4">
                      <div className={cn("min-w-0", !admin.active && "opacity-60")}>
                        <UserAvatar name={fullNameOf(admin)} description={admin.email} />
                      </div>
                      <div className="flex items-center justify-between gap-3 pl-[2.625rem] sm:contents">
                        <div className="flex">
                          <ActiveBadge active={admin.active} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                          <span className="sm:hidden">Added </span>
                          {formatSast(admin.created_at, "date")}
                        </span>
                      </div>
                    </ListRow>
                  ))}
                </ListBody>
              )}
            </SectionCard>

            <SectionCard title="This account" description="What a Platform Admin can do here">
              <ul className="flex flex-col gap-3">
                {SCOPE.map(({ can, text }) => (
                  <li key={text} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        "-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                        can ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {can ? <Check className="size-3.5" aria-label="Can" /> : <Minus className="size-3.5" aria-label="Can't" />}
                    </span>
                    <span className={can ? "text-foreground" : "text-muted-foreground"}>{text}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
