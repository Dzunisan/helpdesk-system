import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, CircleDot, Pencil, Plus, RotateCw, SearchX, UserCog, UserRoundCheck, UserRoundX, Users as UsersIcon } from "lucide-react";
import { listUsers } from "@/services/users";
import { listDepartments } from "@/services/departments";
import type { User } from "@/types/api";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { AccountStatusBadge, RoleBadge } from "@/components/admin/AdminBadges";
import FilterChip from "@/components/app/FilterChip";
import RowMenu from "@/components/admin/RowMenu";
import UserSheet from "@/components/admin/UserSheet";
import { useAccountActions } from "@/components/admin/useAccountActions";
import { useLoader } from "@/components/admin/useLoader";
import { accountStatusOf, fullNameOf, type AccountStatus } from "@/components/admin/users";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

/* One grid for the header, the rows and the skeleton. Below xl the rows stack (avatar + name,
 * then role · department · status · last sign-in), because six columns don't fit beside the sidebar. */
const GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_9.5rem_10rem_7rem_9rem_2rem] xl:items-center xl:gap-6";
const PAGE_SIZE = 25;

/** The first choice of every filter: no filtering */
const ANY = { value: "all", label: "Any" };
const ROLE_OPTIONS = [
  { value: "Department Lead", label: "Department leads" },
  { value: "Agent", label: "Agents" },
  { value: "Employee", label: "Employees" },
];
const STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "deactivated", label: "Deactivated" },
];

const loadDepartments = async () => (await listDepartments({ limit: 100 })).departments;

/** System Admin › Users (briefing p.61, S1): everyone at the company except admins. */
export default function StaffUsers() {
  const users = useLoader(() => listUsers());
  const departments = useLoader(loadDepartments);
  const [params] = useSearchParams();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  // Links from the overview and Departments pages open this page filtered to one department
  const [department, setDepartment] = useState(params.get("department") ?? "all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });

  const upsert = (saved: User) =>
    users.setData((list) => {
      const current = list ?? [];
      return current.some((u) => u.user_id === saved.user_id)
        ? current.map((u) => (u.user_id === saved.user_id ? saved : u))
        : [saved, ...current];
    });
  const actions = useAccountActions(upsert);

  const all = useMemo(() => users.data ?? [], [users.data]);
  const departmentList = useMemo(() => departments.data ?? [], [departments.data]);
  const departmentName = useMemo(
    () => new Map(departmentList.map((d) => [d.department_id, d.department_name])),
    [departmentList],
  );
  const nameOfDepartment = (u: User) =>
    u.department_name ?? (u.department_id != null ? departmentName.get(u.department_id) ?? null : null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...all]
      .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
      .filter((u) => {
        if (role !== "all" && u.role !== role) return false;
        if (status !== "all" && accountStatusOf(u) !== status) return false;
        if (department === "none" && u.department_id != null) return false;
        if (department !== "all" && department !== "none" && String(u.department_id) !== department) return false;
        if (!q) return true;
        return `${fullNameOf(u)} ${u.email}`.toLowerCase().includes(q);
      });
  }, [all, search, role, status, department]);

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

  const firstLoad = users.loading && users.data === null;
  const loadFailed = !!users.error && users.data === null;
  const activeCount = all.filter((u) => u.active).length;
  const invitedCount = all.filter((u) => accountStatusOf(u) === "invited").length;

  const departmentOptions = [
    ...departmentList.map((d) => ({ value: String(d.department_id), label: d.department_name })),
    { value: "none", label: "No department" },
  ];

  const openAdd = () => setSheet({ open: true, user: null });
  const addButton = (
    <Button onClick={openAdd}>
      <Plus data-icon="inline-start" />
      Add user
    </Button>
  );

  const refresh = () => {
    users.reload();
    departments.reload();
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Users"
        description={
          firstLoad || loadFailed
            ? "Department leads, agents and employees at Mzansi Freight"
            : `${all.length} ${all.length === 1 ? "person" : "people"} at Mzansi Freight · ${activeCount} active${
                invitedCount ? ` · ${invitedCount} invited` : ""
              }`
        }
        actions={
          <>
            <Button variant="outline" onClick={refresh} disabled={users.loading} aria-label="Refresh the list">
              <RotateCw data-icon="inline-start" className={cn(users.loading && "animate-spin")} />
              Refresh
            </Button>
            {addButton}
          </>
        }
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Role" icon={UserCog} value={role} anyValue="all" onValueChange={withReset(setRole)} options={[ANY, ...ROLE_OPTIONS]} />
          <FilterChip
            label="Department"
            icon={Building2}
            value={department}
            anyValue="all"
            onValueChange={withReset(setDepartment)}
            options={[ANY, ...departmentOptions]}
          />
          <FilterChip label="Status" icon={CircleDot} value={status} anyValue="all" onValueChange={withReset(setStatus)} options={[ANY, ...STATUS_OPTIONS]} />
        </div>
        <SearchInput id="search-users" value={search} onValueChange={withReset(setSearch)} placeholder="Search name or email" />
      </Toolbar>

      {loadFailed ? (
        <ErrorState title="Couldn't load the users" description={users.error?.message} onRetry={users.reload} retrying={users.loading} />
      ) : (
        <ListCard>
          <ListHeaderRow grid={GRID}>
            <span>Name</span>
            <span>Role</span>
            <span>Department</span>
            <span>Status</span>
            <span>Last sign-in</span>
            <span className="sr-only">Actions</span>
          </ListHeaderRow>

          {firstLoad ? (
            <LoadingRows grid={GRID} breakpoint="xl" rows={6} columns={["person", "badge", "text", "badge", "meta", "icon"]} />
          ) : visible.length === 0 ? (
            all.length === 0 ? (
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
                  key={u.user_id}
                  user={u}
                  departmentName={nameOfDepartment(u)}
                  busy={actions.busy}
                  onEdit={() => setSheet({ open: true, user: u })}
                  onDeactivate={() => actions.request("deactivate", u)}
                  onReactivate={() => actions.request("reactivate", u)}
                />
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!firstLoad && !loadFailed && all.length > 0 && (
        <div className="-mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ListCaption>
            {visible.length === 0
              ? `Showing 0 of ${all.length} people`
              : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${visible.length}${
                  filtered ? ` matching · ${all.length} people in total` : " people"
                } · ${PAGE_SIZE} per page`}
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

      <UserSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        user={sheet.user}
        scope="staff"
        departments={departmentList}
        onSaved={upsert}
      />
      {actions.dialogs}
    </div>
  );
}

interface UserRowProps {
  user: User;
  departmentName: string | null;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}

function UserRow({ user, departmentName, busy, onEdit, onDeactivate, onReactivate }: UserRowProps) {
  const name = fullNameOf(user);
  const status = accountStatusOf(user);
  const lastSignIn = user.last_login_at ? formatSast(user.last_login_at, "smart") : null;

  return (
    <ListRow grid={GRID} className="has-[[data-row-edit]:hover]:bg-muted/50">
      {/* Who: the name button stretches over the row, so a click anywhere opens Edit */}
      <div className={cn("flex min-w-0 items-center gap-3 pr-10 xl:pr-0", !user.active && "opacity-60")}>
        <UserAvatar name={name} />
        <div className="grid min-w-0 leading-tight">
          <Button
            type="button"
            variant="link"
            data-row-edit=""
            onClick={onEdit}
            aria-label={`Edit ${name}`}
            className="block h-auto truncate rounded-none border-0 p-0 text-left text-sm font-medium text-foreground hover:no-underline focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-0 after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {name}
          </Button>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
      </div>

      {/* Role · department · status · last sign-in: one wrapped line under the name on phones, four columns on wide screens */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-11 xl:contents">
        <div className="flex">
          <RoleBadge role={user.role} />
        </div>
        <div className="flex min-w-0 items-center text-xs xl:text-sm">
          {departmentName ? (
            <span className="truncate text-muted-foreground xl:text-foreground">{departmentName}</span>
          ) : (
            <span className="truncate text-muted-foreground italic">No department</span>
          )}
        </div>
        {/* On phones "Active" is the norm, so only Invited and Deactivated show a badge there */}
        <div className={cn("flex", status === "active" && "hidden xl:flex")}>
          <AccountStatusBadge status={status} />
        </div>
        <span
          className={cn(
            "text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:text-sm",
            !lastSignIn && status === "invited" && "hidden xl:inline",
          )}
        >
          {lastSignIn ? (
            <>
              <span className="xl:hidden">Last sign-in </span>
              {lastSignIn}
            </>
          ) : (
            <>
              <span className="xl:hidden">Never signed in</span>
              <span className="hidden xl:inline">Never</span>
            </>
          )}
        </span>
      </div>

      <div className="absolute top-4 right-4 xl:static xl:flex xl:justify-end">
        <RowMenu label={`Actions for ${name}`} disabled={busy} className="xl:-mr-2">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit user
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.active ? (
            <DropdownMenuItem variant="destructive" onSelect={onDeactivate}>
              <UserRoundX />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReactivate}>
              <UserRoundCheck />
              Reactivate
            </DropdownMenuItem>
          )}
        </RowMenu>
      </div>
    </ListRow>
  );
}
