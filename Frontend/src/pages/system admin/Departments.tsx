import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CirclePower, Pencil, Plus, RotateCw, SearchX, Shapes, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useDepartments, type Department } from "@/hooks/useDepartments";
import { fetchAdminOverview, type AdminOverviewDepartment } from "@/services/reportService";
import { listUsers } from "@/services/users";
import { listCategories } from "@/services/categories";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge, NoLeadBadge } from "@/components/admin/AdminBadges";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import AppointLeadDialog, { type LeadTarget } from "@/components/admin/AppointLeadDialog";
import DepartmentSheet from "@/components/admin/DepartmentSheet";
import RowMenu from "@/components/admin/RowMenu";
import { useLoader } from "@/components/admin/useLoader";
import { fullNameOf } from "@/components/admin/users";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type Tab = "all" | "active" | "inactive";

/* Department · Lead · Agents · Categories · Open tickets · Status · menu. Below xl the rows stack. */
const GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_13rem_4rem_5.5rem_6rem_6.5rem_2rem] xl:items-center xl:gap-6";

const isActive = (d: Department) => d.status !== "inactive";

/** Category count per department, inactive categories included */
const loadCategoryCounts = async () => {
  const { categories } = await listCategories({ includeInactive: true });
  const counts = new Map<number, number>();
  for (const c of categories) counts.set(c.department_id, (counts.get(c.department_id) ?? 0) + 1);
  return counts;
};

/** System Admin › Departments (briefing p.62) */
export default function Departments() {
  const {
    departments,
    loading,
    isRefetching,
    actionLoading,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    fetchAll,
    refetch,
    error,
  } = useDepartments();
  // Everyone the System Admin manages: lead names and the Appoint lead candidates
  const users = useLoader(() => listUsers());
  const categoryCounts = useLoader(loadCategoryCounts);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<Department | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadTarget, setLeadTarget] = useState<LeadTarget | null>(null);

  // Agent and open-ticket counts come from the overview report (counts only, so HR stays private)
  const [counts, setCounts] = useState<Map<string, AdminOverviewDepartment> | null>(null);
  const loadCounts = useCallback(() => {
    fetchAdminOverview()
      .then((data) => setCounts(new Map(data.departments.map((d) => [String(d.department_id), d]))))
      .catch(() => setCounts(new Map()));
  }, []);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const leadNameOf = useCallback(
    (d: Department): string | null => {
      if (d.departmentLead?.trim()) return d.departmentLead.trim();
      if (d.lead_name || d.lead_surname) return `${d.lead_name ?? ""} ${d.lead_surname ?? ""}`.trim();
      if (d.lead_id != null) {
        const match = users.data?.find((u) => u.user_id === String(d.lead_id));
        if (match) return fullNameOf(match);
      }
      return null;
    },
    [users.data],
  );

  const departmentNames = useMemo(
    () => new Map(departments.map((d) => [Number(d.department_id), d.department_name])),
    [departments],
  );
  const leaderIds = useMemo(
    () => new Set(departments.filter((d) => d.lead_id != null && d.lead_id !== "").map((d) => String(d.lead_id))),
    [departments],
  );

  const tabCounts = useMemo(
    () => ({
      all: departments.length,
      active: departments.filter(isActive).length,
      inactive: departments.filter((d) => !isActive(d)).length,
    }),
    [departments],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departments
      .filter((d) => (tab === "all" ? true : tab === "active" ? isActive(d) : !isActive(d)))
      .filter((d) => !q || `${d.department_name} ${d.description ?? ""} ${leadNameOf(d) ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || a.department_name.localeCompare(b.department_name));
  }, [departments, tab, search, leadNameOf]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (d: Department) => {
    setEditing(d);
    setSheetOpen(true);
  };
  const openAppoint = (d: Department) => {
    setLeadTarget({
      department_id: Number(d.department_id),
      department_name: d.department_name,
      lead_id: d.lead_id != null && d.lead_id !== "" ? String(d.lead_id) : null,
      lead_name: leadNameOf(d),
    });
    setLeadOpen(true);
  };
  const askDeactivate = (d: Department) => {
    setDeactivating(d);
    setConfirmOpen(true);
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    const dept = deactivating;
    setConfirmOpen(false);
    try {
      await deleteDepartment(dept.department_id);
      toast.success(`${dept.department_name} was deactivated`);
      loadCounts();
    } catch (err) {
      toast.error(`Couldn't deactivate ${dept.department_name}`, {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const reactivate = async (dept: Department) => {
    try {
      await updateDepartment(dept.department_id, { status: "active" });
      toast.success(`${dept.department_name} is active again`);
      loadCounts();
    } catch (err) {
      toast.error(`Couldn't reactivate ${dept.department_name}`, {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const refreshAll = () => {
    refetch();
    loadCounts();
    users.reload();
    categoryCounts.reload();
  };

  const loadFailed = !!error && !loading && departments.length === 0;

  const addButton = (
    <Button onClick={openCreate}>
      <Plus data-icon="inline-start" />
      Add department
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Departments"
        description="Each department is a private queue with its own lead and agents."
        actions={
          <>
            <Button variant="outline" onClick={refreshAll} disabled={isRefetching || loading} aria-label="Refresh the list">
              <RotateCw data-icon="inline-start" className={cn(isRefetching && "animate-spin")} />
              Refresh
            </Button>
            {addButton}
          </>
        }
      />

      <Toolbar>
        <FilterTabs
          aria-label="Filter departments by status"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "all", label: "All", count: loading || loadFailed ? undefined : tabCounts.all },
            { value: "active", label: "Active", count: loading || loadFailed ? undefined : tabCounts.active },
            { value: "inactive", label: "Inactive", count: loading || loadFailed ? undefined : tabCounts.inactive },
          ]}
        />
        <SearchInput id="search-departments" value={search} onValueChange={setSearch} placeholder="Search name, description or lead" />
      </Toolbar>

      {loadFailed ? (
        <ErrorState title="Couldn't load the departments" onRetry={() => fetchAll()} retrying={loading} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={GRID}>
            <span>Department</span>
            <span>Lead</span>
            <span className="text-right">Agents</span>
            <span className="text-right">Categories</span>
            <span className="text-right">Open tickets</span>
            <span className="pl-2">Status</span>
            <span className="sr-only">Actions</span>
          </ListHeaderRow>

          {loading ? (
            <LoadingRows grid={GRID} breakpoint="xl" rows={4} columns={["title", "avatar", "meta", "meta", "meta", "badge", "icon"]} />
          ) : visible.length === 0 ? (
            departments.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No departments yet"
                description="Create the first department, then appoint its lead and add agents."
                action={addButton}
              />
            ) : search ? (
              <EmptyState
                icon={SearchX}
                title="Nothing matches your search"
                description="Try another name, or search by the lead's name."
                action={
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Building2}
                title={tab === "inactive" ? "No inactive departments" : "No active departments"}
                description={tab === "inactive" ? "Departments you deactivate stay here, greyed out." : "Reactivate one, or add a new department."}
              />
            )
          ) : (
            <ListBody>
              {visible.map((d) => (
                <DepartmentRow
                  key={d.department_id}
                  department={d}
                  leadName={leadNameOf(d)}
                  stats={counts ? counts.get(String(d.department_id)) ?? null : undefined}
                  categories={
                    categoryCounts.data
                      ? categoryCounts.data.get(Number(d.department_id)) ?? 0
                      : categoryCounts.error
                        ? null
                        : undefined
                  }
                  busy={actionLoading}
                  onEdit={() => openEdit(d)}
                  onAppoint={() => openAppoint(d)}
                  onDeactivate={() => askDeactivate(d)}
                  onReactivate={() => reactivate(d)}
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!loading && !loadFailed && departments.length > 0 && (
        <ListCaption className="-mt-5">
          Showing {visible.length} of {departments.length} departments · counts only, so HR stays private
        </ListCaption>
      )}

      <DepartmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        department={editing}
        submitting={actionLoading}
        onCreate={async (data) => {
          await createDepartment(data);
          loadCounts();
        }}
        onUpdate={async (id, data) => {
          await updateDepartment(id, data);
          loadCounts();
        }}
      />

      <AppointLeadDialog
        open={leadOpen}
        onOpenChange={setLeadOpen}
        department={leadTarget}
        users={users.data}
        departmentNames={departmentNames}
        leaderIds={leaderIds}
        onAppointed={() => {
          refetch();
          loadCounts();
          users.reload();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={CirclePower}
        destructive
        title={`Deactivate ${deactivating?.department_name ?? "this department"}?`}
        description="It's marked inactive and stays in this list, greyed out. Its people and tickets aren't deleted, and you can reactivate it from the row menu."
        confirmLabel="Deactivate"
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}

interface DepartmentRowProps {
  department: Department;
  leadName: string | null;
  /** undefined while counts load, null if they aren't available */
  stats: AdminOverviewDepartment | null | undefined;
  /** Category count: undefined while loading, null if unavailable */
  categories: number | null | undefined;
  busy: boolean;
  onEdit: () => void;
  onAppoint: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}

function DepartmentRow({
  department: d,
  leadName,
  stats,
  categories,
  busy,
  onEdit,
  onAppoint,
  onDeactivate,
  onReactivate,
}: DepartmentRowProps) {
  const active = isActive(d);
  const agents = stats === undefined ? "…" : stats ? stats.agents : "—";
  const open = stats === undefined ? "…" : stats ? stats.open_tickets : "—";
  const cats = categories === undefined ? "…" : categories === null ? "—" : categories;

  return (
    <ListRow grid={GRID} className={cn("relative", !active && "bg-muted/30")}>
      <div className={cn("min-w-0 pr-10 xl:pr-0", !active && "opacity-60")}>
        <p className="truncate text-sm font-medium text-foreground">{d.department_name}</p>
        {d.description ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={d.description}>
            {d.description}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/70 italic">No description</p>
        )}
      </div>

      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 xl:contents", !active && "opacity-60")}>
        <div className="flex min-w-0">
          {leadName ? <UserAvatar name={leadName} size="sm" showName /> : <NoLeadBadge />}
        </div>
        {/* Phones: one quiet line of counts. Wide screens: two right-aligned number columns. */}
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:hidden">
          {agents} {agents === 1 ? "agent" : "agents"} · {cats} {cats === 1 ? "category" : "categories"} · {open} open
        </span>
        <span className="hidden text-right text-sm tabular-nums xl:block">{agents}</span>
        <span className="hidden text-right text-sm tabular-nums xl:block">{cats}</span>
        <span className="hidden text-right text-sm tabular-nums xl:block">{open}</span>
        <div className={cn("flex xl:pl-2", active && "hidden xl:flex")}>
          <ActiveBadge active={active} inactiveLabel="Inactive" />
        </div>
      </div>

      <div className="absolute top-4 right-4 xl:static xl:flex xl:justify-end">
        <RowMenu label={`Actions for ${d.department_name}`} disabled={busy} className="xl:-mr-2">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{d.department_name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit department
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAppoint} disabled={!active}>
            <UserRoundPlus />
            {leadName ? "Change lead" : "Appoint lead"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/system-admin/users?department=${d.department_id}`}>
              <UsersRound />
              People
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/system-admin/categories?department=${d.department_id}`}>
              <Shapes />
              Categories
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {active ? (
            <DropdownMenuItem variant="destructive" onSelect={onDeactivate}>
              <CirclePower />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReactivate}>
              <CirclePower />
              Reactivate
            </DropdownMenuItem>
          )}
        </RowMenu>
      </div>
    </ListRow>
  );
}
