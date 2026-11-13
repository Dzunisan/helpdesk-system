import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, RotateCw, SearchX, Trash2, UserRoundCheck, UserRoundX, Users as UsersIcon } from "lucide-react";
import { useUsers, type User } from "@/context/UsersContext";
import { useDepartments } from "@/hooks/useDepartments";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge, RoleBadge } from "@/components/admin/AdminBadges";
import AddUserSheet from "@/components/admin/AddUserSheet";
import FilterSelect from "@/components/admin/FilterSelect";
import RowMenu from "@/components/admin/RowMenu";
import { fullNameOf, useAccountActions, userIdOf } from "@/components/admin/useAccountActions";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

/* One grid for the header, the rows and the skeleton. Below xl the rows stack (avatar + name,
 * then role · department · status), because five columns don't fit beside the sidebar. */
const GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_9.5rem_11rem_8rem_2rem] xl:items-center xl:gap-6";
const PAGE_SIZE = 25;

const ROLE_OPTIONS = [
  { value: "Department Lead", label: "Department leads" },
  { value: "Agent", label: "Agents" },
  { value: "Employee", label: "Employees" },
];
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

/** System Admin › Users (briefing p.61): everyone at the company except admins. */
export default function StaffUsers() {
  const { users, loading, error, fetchUsers } = useUsers();
  const { departments } = useDepartments();
  const actions = useAccountActions();
  const [params] = useSearchParams();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  // The overview's "Fix users" link opens this page filtered to people without a department
  const [department, setDepartment] = useState(params.get("department") ?? "all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  const departmentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) map.set(String(d.department_id), d.department_name);
    return map;
  }, [departments]);

  const sorted = useMemo(() => [...users].sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b))), [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((u) => {
      if (role !== "all" && u.role !== role) return false;
      if (status === "active" && !u.active) return false;
      if (status === "inactive" && u.active) return false;
      if (department === "none" && u.department_id != null) return false;
      if (department !== "all" && department !== "none" && String(u.department_id) !== department) return false;
      if (!q) return true;
      return `${fullNameOf(u)} ${u.email}`.toLowerCase().includes(q);
    });
  }, [sorted, search, role, status, department]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const filtered = search.trim() !== "" || role !== "all" || status !== "all" || department !== "all";
  const onlySearch = search.trim() !== "" && role === "all" && status === "all" && department === "all";
  const resetFilters = () => {
    setSearch("");
    setRole("all");
    setStatus("all");
    setDepartment("all");
    setPage(0);
  };
  const withReset = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(0);
  };

  const firstLoad = loading && users.length === 0;
  const loadFailed = !!error && !loading && users.length === 0;
  const activeCount = users.filter((u) => u.active).length;

  const departmentOptions = [
    ...departments.map((d) => ({ value: String(d.department_id), label: d.department_name })),
    { value: "none", label: "No department" },
  ];

  const addButton = (
    <Button onClick={() => setAddOpen(true)}>
      <Plus data-icon="inline-start" />
      Add user
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Users"
        description={
          firstLoad || loadFailed
            ? "Department leads, agents and employees at Mzansi Freight"
            : `${users.length} ${users.length === 1 ? "person" : "people"} at Mzansi Freight · ${activeCount} active`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => fetchUsers()} disabled={loading} aria-label="Refresh the list">
              <RotateCw data-icon="inline-start" className={cn(loading && "animate-spin")} />
              Refresh
            </Button>
            {addButton}
          </>
        }
      />

      <Toolbar>
        <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 sm:flex sm:items-center">
          <FilterSelect label="Role" allLabel="All roles" value={role} onValueChange={withReset(setRole)} options={ROLE_OPTIONS} />
          <FilterSelect
            label="Department"
            allLabel="All departments"
            value={department}
            onValueChange={withReset(setDepartment)}
            options={departmentOptions}
          />
          <FilterSelect label="Status" allLabel="All statuses" value={status} onValueChange={withReset(setStatus)} options={STATUS_OPTIONS} />
        </div>
        <SearchInput id="search-users" value={search} onValueChange={withReset(setSearch)} placeholder="Search name or email" />
      </Toolbar>

      {loadFailed ? (
        <ErrorState title="Couldn't load the users" onRetry={() => fetchUsers()} retrying={loading} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={GRID}>
            <span>Name</span>
            <span>Role</span>
            <span>Department</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </ListHeaderRow>

          {firstLoad ? (
            <LoadingRows grid={GRID} breakpoint="xl" rows={6} columns={["avatar", "badge", "text", "badge", "icon"]} />
          ) : visible.length === 0 ? (
            users.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title="No users yet"
                description="Add the first department lead, agent or employee. They'll get an email to sign in."
                action={addButton}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No one matches"
                description={
                  onlySearch
                    ? "Try another name or email."
                    : search
                      ? "Try another name or email, or clear the filters."
                      : "Try a different combination of filters."
                }
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    {onlySearch ? "Clear search" : "Clear filters"}
                  </Button>
                }
              />
            )
          ) : (
            <ListBody>
              {pageRows.map((u) => (
                <UserRow
                  key={userIdOf(u)}
                  user={u}
                  departmentName={u.department_id != null ? departmentName.get(String(u.department_id)) : undefined}
                  busy={actions.busy}
                  onDeactivate={() => actions.requestDeactivate(u)}
                  onReactivate={() => actions.reactivate(u)}
                  onDelete={() => actions.requestDelete(u)}
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!firstLoad && !loadFailed && users.length > 0 && (
        <div className="-mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ListCaption>
            {visible.length === 0
              ? `Showing 0 of ${users.length} people`
              : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${visible.length}${
                  filtered ? ` matching · ${users.length} people in total` : " people"
                }`}
            {pageCount > 1 && ` · ${PAGE_SIZE} per page`}
          </ListCaption>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {currentPage + 1} of {pageCount}
              </span>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          )}
        </div>
      )}

      <AddUserSheet open={addOpen} onOpenChange={setAddOpen} departments={departments} />
      {actions.dialogs}
    </div>
  );
}

interface UserRowProps {
  user: User;
  departmentName?: string;
  busy: boolean;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function UserRow({ user, departmentName, busy, onDeactivate, onReactivate, onDelete }: UserRowProps) {
  const name = fullNameOf(user);
  const department = departmentName ?? (user.department_id != null ? "—" : null);

  return (
    <ListRow grid={GRID} className="relative">
      {/* Who */}
      <div className={cn("flex min-w-0 items-center gap-3 pr-10 xl:pr-0", !user.active && "opacity-60")}>
        <UserAvatar name={name} />
        <div className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
      </div>

      {/* Role · department · status: one wrapped line under the name on phones, three columns on wide screens */}
      {/* On phones "Active" is the norm, so only a deactivated account shows its status badge there */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-11 xl:contents">
        <div className="flex">
          <RoleBadge role={user.role} />
        </div>
        <div className="flex min-w-0 items-center text-xs xl:text-sm">
          {department ? (
            <span className="truncate text-muted-foreground xl:text-foreground">{department}</span>
          ) : (
            <span className="truncate text-muted-foreground italic">No department</span>
          )}
        </div>
        <div className={cn("flex", user.active && "hidden xl:flex")}>
          <ActiveBadge active={user.active} />
        </div>
      </div>

      <div className="absolute top-4 right-4 xl:static xl:flex xl:justify-end">
        <RowMenu label={`Actions for ${name}`} disabled={busy} className="xl:-mr-2">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
          {user.active ? (
            <DropdownMenuItem onSelect={onDeactivate}>
              <UserRoundX />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReactivate}>
              <UserRoundCheck />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete user
          </DropdownMenuItem>
        </RowMenu>
      </div>
    </ListRow>
  );
}
