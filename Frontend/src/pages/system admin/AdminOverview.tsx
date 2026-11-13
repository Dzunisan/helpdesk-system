import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Building2, Inbox, Shapes, Timer, UserRoundX, Users } from "lucide-react";
import { fetchAdminOverview, type AdminOverview as Overview } from "@/services/reportService";
import { listCategories } from "@/services/categories";
import { listSlaPolicies } from "@/services/slaPolicies";
import type { Category, SlaPolicy } from "@/types/api";
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
import { useLoader } from "@/components/admin/useLoader";
import ServiceLevels from "@/components/admin/ServiceLevels";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; data: Overview };

/* Department · Lead · Agents · Open · Breached (page 60). Stacks below sm. */
const GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_4rem_4rem_4.5rem] sm:items-center sm:gap-6";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const loadCategories = async () => (await listCategories({ includeInactive: true })).categories;

/**
 * System Admin home (briefing p.60): organisation totals, the department table
 * (counts only, so HR stays private), a set-up checklist for broken configuration and the
 * S8 service-level tiles for the organisation or one department (aggregates only).
 */
export default function AdminOverview() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  // The checklist also checks routing and SLA targets; if either fails, those lines are left out
  const categories = useLoader(loadCategories);
  const policies = useLoader(listSlaPolicies);

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
    categories.reload();
    policies.reload();
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              value={data?.totals.open_tickets}
              hint="Across all departments"
            />
            <StatCard
              label="Breached"
              icon={AlarmClock}
              loading={loading}
              tone={data && data.totals.breached_tickets > 0 ? "danger" : "default"}
              value={data?.totals.breached_tickets}
              hint="Open tickets past a due time"
            />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <DepartmentsCard data={data} />
            <ChecklistCard
              data={data}
              categories={categories.loading ? undefined : categories.data}
              policies={policies.loading ? undefined : policies.data}
            />
          </div>

          <ServiceLevels departments={data?.departments ?? []} />
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
        <span className="text-right">Breached</span>
      </ListHeaderRow>
      {!data ? (
        <LoadingRows grid={GRID} breakpoint="sm" rows={4} columns={["text", "avatar", "meta", "meta", "meta"]} />
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
                    {d.breached_tickets > 0 && <span className="text-destructive"> · {d.breached_tickets} breached</span>}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{d.agents}</span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{d.open_tickets}</span>
                  <span
                    className={cn(
                      "hidden text-right text-sm tabular-nums sm:block",
                      d.breached_tickets > 0 ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {d.breached_tickets}
                  </span>
                </div>
              </ListRow>
            );
          })}
        </ListBody>
      )}
    </SectionCard>
  );
}

interface ChecklistCardProps {
  data: Overview | null;
  /** undefined while loading, null when it couldn't be loaded (the check is skipped) */
  categories: Category[] | null | undefined;
  policies: SlaPolicy[] | null | undefined;
}

function ChecklistCard({ data, categories, policies }: ChecklistCardProps) {
  if (!data || categories === undefined || policies === undefined) {
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

  // Routing (S5): every active category must route to an active department, and every active
  // department needs at least one active category or employees can't send it anything
  const activeDepartments = data.departments.filter((d) => d.status === "active");
  const activeIds = new Set(activeDepartments.map((d) => d.department_id));
  const misrouted = (categories ?? []).filter((c) => c.active && !activeIds.has(c.department_id));
  const withCategories = new Set((categories ?? []).filter((c) => c.active).map((c) => c.department_id));
  const noCategories = categories ? activeDepartments.filter((d) => !withCategories.has(d.department_id)) : [];
  const slaMissing = policies ? 4 - policies.length : 0;

  const todo = noLead.length + (noDept > 0 ? 1 : 0) + misrouted.length + noCategories.length + (slaMissing > 0 ? 1 : 0);

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
        {categories &&
          (misrouted.length === 0 && noCategories.length === 0 ? (
            <ChecklistItem state="done">Every category routes to an active department</ChecklistItem>
          ) : (
            <>
              {misrouted.map((c) => (
                <ChecklistItem
                  key={`c-${c.category_id}`}
                  state="todo"
                  icon={Shapes}
                  action={{ label: "Set route", to: `/system-admin/categories?department=${c.department_id}` }}
                >
                  &ldquo;{c.category_name}&rdquo; routes to {c.department_name}, which is inactive
                </ChecklistItem>
              ))}
              {noCategories.map((d) => (
                <ChecklistItem
                  key={`d-${d.department_id}`}
                  state="todo"
                  icon={Shapes}
                  action={{ label: "Add category", to: `/system-admin/categories?department=${d.department_id}` }}
                >
                  {d.department_name} has no active categories, so employees can&apos;t send it requests
                </ChecklistItem>
              ))}
            </>
          ))}
        {policies &&
          (slaMissing <= 0 ? (
            <ChecklistItem state="done">SLA policies set for all 4 priorities</ChecklistItem>
          ) : (
            <ChecklistItem state="todo" icon={Timer} action={{ label: "Set targets", to: "/system-admin/sla" }}>
              {plural(slaMissing, "priority has", "priorities have")} no SLA targets
            </ChecklistItem>
          ))}
      </ul>
    </SectionCard>
  );
}
