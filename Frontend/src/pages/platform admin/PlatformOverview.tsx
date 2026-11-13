import { Link } from "react-router-dom";
import { ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { listUsers } from "@/services/users";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import { CapabilityItem } from "@/components/admin/ChecklistItem";
import CardLink from "@/components/app/CardLink";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { AccountStatusBadge } from "@/components/admin/AdminBadges";
import { useLoader } from "@/components/admin/useLoader";
import { accountStatusOf, byActiveThenName, fullNameOf } from "@/components/admin/users";
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
  // For a Platform Admin, GET /api/users returns System Admins only (docs/api-sprint-1.md S1)
  const users = useLoader(() => listUsers());
  const systemAdmins = users.data ?? [];
  const firstLoad = users.loading && users.data === null;
  const loadFailed = !!users.error && users.data === null;
  const active = systemAdmins.filter((u) => u.active).length;
  const deactivated = systemAdmins.length - active;
  const sorted = [...systemAdmins].sort(byActiveThenName);

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
        <ErrorState title="Couldn't load the system admins" onRetry={users.reload} retrying={users.loading} />
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
              description="People who manage users and departments"
              flush
              action={
                <CardLink to="/platform-admin/users">Manage</CardLink>
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
                    <ListRow key={admin.user_id} grid={GRID} className="py-4">
                      <div className={cn("min-w-0", !admin.active && "opacity-60")}>
                        <UserAvatar name={fullNameOf(admin)} description={admin.email} />
                      </div>
                      <div className="flex items-center justify-between gap-3 pl-[2.625rem] sm:contents">
                        <div className="flex">
                          <AccountStatusBadge status={accountStatusOf(admin)} />
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
                  <CapabilityItem key={text} can={can}>
                    {text}
                  </CapabilityItem>
                ))}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
