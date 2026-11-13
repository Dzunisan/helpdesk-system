import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Inbox, UserRoundX, Users } from "lucide-react";
import { fetchAdminOverview, type AdminOverview as Overview } from "@/services/reportService";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import SectionCard from "@/components/app/SectionCard";
import CardLink from "@/components/app/CardLink";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge, NoLeadBadge } from "@/components/admin/AdminBadges";
import ChecklistItem from "@/components/admin/ChecklistItem";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; data: Overview };

/* Department · Lead · Agents · Open. Stacks below sm. */
const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_4rem_4rem] sm:items-center sm:gap-6";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * System Admin home (briefing p.60): organisation totals, the department table
 * (counts only, so HR stays private) and a set-up checklist for broken configuration.
 */
export default function AdminOverview() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminOverview()
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  };

  const data = state.status === "ready" ? state.data : null;
  const loading = state.status === "loading";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" description="Mzansi Freight · organisation set-up and totals" />

      {state.status === "error" ? (
        <ErrorState title="Couldn't load the overview" onRetry={retry} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              label="Active users"
              icon={Users}
              loading={loading}
              to="/system-admin/users"
              value={data?.totals.active_users}
              hint={data && `${data.totals.inactive_users} deactivated`}
            />
            <StatCard
              label="Departments"
              icon={Building2}
              loading={loading}
              to="/system-admin/departments"
              value={data && `${data.totals.active_departments} active`}
              hint={data && `${data.totals.inactive_departments} inactive`}
            />
            <StatCard
              label="Open tickets"
              icon={Inbox}
              loading={loading}
              className="col-span-2 lg:col-span-1"
              value={data?.totals.open_tickets}
              hint="Across all departments"
            />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <DepartmentsCard data={data} />
            <ChecklistCard data={data} />
          </div>
        </>
      )}
    </div>
  );
}

function DepartmentsCard({ data }: { data: Overview | null }) {
  const departments = data?.departments ?? [];
  return (
    <SectionCard
      title="Departments"
      description="Who leads each team, and how busy it is"
      flush
      action={
        <CardLink to="/system-admin/departments">Manage</CardLink>
      }
      footer="Counts only. System Admins don't read ticket contents, so HR stays private."
    >
      <ListHeaderRow grid={GRID}>
        <span>Department</span>
        <span>Lead</span>
        <span className="text-right">Agents</span>
        <span className="text-right">Open</span>
      </ListHeaderRow>
      {!data ? (
        <LoadingRows grid={GRID} breakpoint="sm" rows={4} columns={["text", "avatar", "meta", "meta"]} />
      ) : departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          size="compact"
          title="No departments yet"
          description="Create one to start routing requests."
          action={
            <Button asChild variant="outline">
              <Link to="/system-admin/departments">Add department</Link>
            </Button>
          }
        />
      ) : (
        <ListBody>
          {departments.map((d) => {
            const active = d.status === "active";
            return (
              <ListRow key={d.department_id} grid={GRID} className={cn("py-4", !active && "bg-muted/30")}>
                <div className={cn("flex min-w-0 items-center gap-2", !active && "opacity-60")}>
                  <span className="truncate text-sm font-medium text-foreground">{d.department_name}</span>
                  {!active && <ActiveBadge active={false} inactiveLabel="Inactive" />}
                </div>
                <div className={cn("flex min-w-0 items-center justify-between gap-3 sm:contents", !active && "opacity-60")}>
                  <div className="flex min-w-0">
                    {d.lead_name ? <UserAvatar name={d.lead_name} size="sm" showName /> : <NoLeadBadge />}
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:hidden">
                    {plural(d.agents, "agent", "agents")} · {d.open_tickets} open
                  </span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{d.agents}</span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{d.open_tickets}</span>
                </div>
              </ListRow>
            );
          })}
        </ListBody>
      )}
    </SectionCard>
  );
}

function ChecklistCard({ data }: { data: Overview | null }) {
  if (!data) {
    return (
      <SectionCard title="Set-up checklist">
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full bg-foreground/[0.07]" />
              <Skeleton className="h-4 flex-1 bg-foreground/[0.07]" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  const { departments_without_lead: noLead, users_without_department: noDept } = data.checklist;
  const todo = noLead.length + (noDept > 0 ? 1 : 0);

  return (
    <SectionCard
      title="Set-up checklist"
      description={todo === 0 ? "Everything is set up." : `${plural(todo, "thing needs", "things need")} your attention.`}
    >
      <ul className="flex flex-col divide-y divide-border">
        {noLead.length === 0 ? (
          <ChecklistItem state="done">Every active department has a lead</ChecklistItem>
        ) : (
          noLead.map((d) => (
            <ChecklistItem key={d.department_id} state="todo" action={{ label: "Appoint lead", to: "/system-admin/departments" }}>
              {d.department_name} has no department lead
            </ChecklistItem>
          ))
        )}
        {noDept === 0 ? (
          <ChecklistItem state="done">Every user has a department</ChecklistItem>
        ) : (
          <ChecklistItem
            state="todo"
            icon={UserRoundX}
            action={{ label: "Fix users", to: "/system-admin/users?department=none" }}
          >
            {plural(noDept, "user has", "users have")} no department, so they can&apos;t submit or claim tickets
          </ChecklistItem>
        )}
      </ul>
    </SectionCard>
  );
}
