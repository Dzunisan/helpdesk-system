import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, ChevronRight, Plus, RotateCw, SearchX, Shapes } from "lucide-react";
import { listCategories } from "@/services/categories";
import { listDepartments } from "@/services/departments";
import type { Category } from "@/types/api";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { FilterTabs, SearchInput, Toolbar } from "@/components/app/Toolbar";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge, NeedsApprovalBadge } from "@/components/admin/AdminBadges";
import CategoryIconTile from "@/components/admin/CategoryIconTile";
import CategorySheet from "@/components/admin/CategorySheet";
import FilterChip from "@/components/app/FilterChip";
import { useLoader } from "@/components/admin/useLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tab = "all" | "active" | "inactive";

/* Category · Shown under · Default priority · Approval · Extra fields · Status · chevron. Stacks below xl. */
const GRID =
  "xl:grid xl:grid-cols-[minmax(0,1fr)_9.5rem_7rem_8rem_5rem_5.5rem_1rem] xl:items-center xl:gap-6";

const KIND_LABEL = { fix: "Something is broken", request: "I need something" } as const;

const loadCategories = async () => (await listCategories({ includeInactive: true })).categories;
const loadDepartments = async () => (await listDepartments({ limit: 100 })).departments;

/** System Admin › Categories & routing (briefing p.63, S5): what employees choose, and where it goes */
export default function Categories() {
  const categories = useLoader(loadCategories);
  const departments = useLoader(loadDepartments);
  const [params] = useSearchParams();

  const [tab, setTab] = useState<Tab>("all");
  const [department, setDepartment] = useState(params.get("department") ?? "all");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<{ open: boolean; category: Category | null }>({ open: false, category: null });

  const all = useMemo(() => categories.data ?? [], [categories.data]);
  const departmentList = useMemo(() => departments.data ?? [], [departments.data]);
  const inactiveDepartments = useMemo(
    () => new Set(departmentList.filter((d) => d.status === "inactive").map((d) => d.department_id)),
    [departmentList],
  );

  const counts = useMemo(
    () => ({ all: all.length, active: all.filter((c) => c.active).length, inactive: all.filter((c) => !c.active).length }),
    [all],
  );

  /** Filtered, then grouped by department in the server's order (department, kind, name) */
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<number, { id: number; name: string; items: Category[] }>();
    for (const c of all) {
      if (tab === "active" && !c.active) continue;
      if (tab === "inactive" && c.active) continue;
      if (department !== "all" && String(c.department_id) !== department) continue;
      if (q && !`${c.category_name} ${c.description ?? ""} ${c.department_name}`.toLowerCase().includes(q)) continue;
      const group = map.get(c.department_id) ?? { id: c.department_id, name: c.department_name, items: [] };
      group.items.push(c);
      map.set(c.department_id, group);
    }
    return [...map.values()];
  }, [all, tab, department, search]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  const upsert = (saved: Category) =>
    categories.setData((list) => {
      const current = list ?? [];
      return current.some((c) => c.category_id === saved.category_id)
        ? current.map((c) => (c.category_id === saved.category_id ? saved : c))
        : [...current, saved];
    });

  const firstLoad = categories.loading && categories.data === null;
  const loadFailed = !!categories.error && categories.data === null;
  const filtered = search.trim() !== "" || department !== "all" || tab !== "all";

  const openAdd = () => setSheet({ open: true, category: null });
  const addButton = (
    <Button onClick={openAdd}>
      <Plus data-icon="inline-start" />
      Add category
    </Button>
  );
  const departmentOptions = departmentList.map((d) => ({ value: String(d.department_id), label: d.department_name }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Categories & routing"
        description="What employees choose on the New request form, and where each choice goes"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                categories.reload();
                departments.reload();
              }}
              disabled={categories.loading}
              aria-label="Refresh the list"
            >
              <RotateCw data-icon="inline-start" className={cn(categories.loading && "animate-spin")} />
              Refresh
            </Button>
            {addButton}
          </>
        }
      />

      <Toolbar>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FilterTabs
            aria-label="Filter categories by status"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "all", label: "All", count: firstLoad || loadFailed ? undefined : counts.all },
              { value: "active", label: "Active", count: firstLoad || loadFailed ? undefined : counts.active },
              { value: "inactive", label: "Inactive", count: firstLoad || loadFailed ? undefined : counts.inactive },
            ]}
          />
          <FilterChip
            label="Department"
            icon={Building2}
            value={department}
            anyValue="all"
            onValueChange={setDepartment}
            options={[{ value: "all", label: "Any" }, ...departmentOptions]}
          />
        </div>
        <SearchInput id="search-categories" value={search} onValueChange={setSearch} placeholder="Search categories" />
      </Toolbar>

      {loadFailed ? (
        <ErrorState
          title="Couldn't load the categories"
          description={categories.error?.message}
          onRetry={categories.reload}
          retrying={categories.loading}
        />
      ) : (
        <ListCard>
          <ListHeaderRow grid={GRID}>
            <span>Category</span>
            <span>Shown under</span>
            <span>Default priority</span>
            <span>Approval</span>
            <span className="text-right">Extra fields</span>
            <span>Status</span>
            <span className="sr-only">Open</span>
          </ListHeaderRow>

          {firstLoad ? (
            <LoadingRows grid={GRID} breakpoint="xl" rows={6} columns={["person", "meta", "badge", "badge", "meta", "badge", "icon"]} />
          ) : shown === 0 ? (
            all.length === 0 ? (
              <EmptyState
                icon={Shapes}
                title="No categories yet"
                description="Add the first thing employees can ask for, and choose which department handles it."
                action={addButton}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No categories match"
                description={search ? "Try another word, or clear the filters." : "Try a different combination of filters."}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setTab("all");
                      setDepartment("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <ListBody>
              {groups.map((group) => (
                <Fragment key={group.id}>
                  <li className="flex items-center gap-2 bg-muted/30 px-6 py-2.5 text-xs font-medium text-muted-foreground">
                    <span className="text-foreground/80">{group.name}</span>
                    <span className="tabular-nums">· {group.items.length}</span>
                    {inactiveDepartments.has(group.id) && (
                      <Badge variant="outline" className="ml-1 h-4.5 px-1.5 text-[11px] text-muted-foreground">
                        Department inactive
                      </Badge>
                    )}
                  </li>
                  {group.items.map((c) => (
                    <CategoryRow key={c.category_id} category={c} onOpen={() => setSheet({ open: true, category: c })} />
                  ))}
                </Fragment>
              ))}
            </ListBody>
          )}
        </ListCard>
      )}

      {!firstLoad && !loadFailed && all.length > 0 && (
        <ListCaption className="-mt-5">
          Showing {shown} of {all.length} categories{filtered ? "" : ` across ${groups.length} departments`} · deactivate
          instead of deleting, so old tickets keep their category
        </ListCaption>
      )}

      <CategorySheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        category={sheet.category}
        departments={departmentList}
        defaultDepartmentId={department !== "all" ? Number(department) : null}
        onSaved={upsert}
      />
    </div>
  );
}

function CategoryRow({ category: c, onOpen }: { category: Category; onOpen: () => void }) {
  const fieldCount = c.fields.length;
  return (
    <ListRow grid={GRID} className="has-[[data-row-edit]:hover]:bg-muted/50">
      <div className={cn("flex min-w-0 items-center gap-3", !c.active && "opacity-60")}>
        <CategoryIconTile name={c.icon} muted={!c.active} />
        <div className="grid min-w-0 leading-tight">
          <Button
            type="button"
            variant="link"
            data-row-edit=""
            onClick={onOpen}
            aria-label={`Edit ${c.category_name}`}
            className="block h-auto truncate rounded-none border-0 p-0 text-left text-sm font-medium text-foreground hover:no-underline focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-0 after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {c.category_name}
          </Button>
          {c.description && <span className="truncate text-xs text-muted-foreground">{c.description}</span>}
        </div>
      </div>

      {/* Phones: one wrapped line of badges under the name. Wide screens: the columns. */}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-12 xl:contents", !c.active && "opacity-60")}>
        <span className="hidden truncate text-sm text-muted-foreground xl:block">{KIND_LABEL[c.kind]}</span>
        <div className="flex">
          <PriorityBadge priority={c.default_priority} />
        </div>
        <div className={cn("flex", !c.needs_approval && "hidden xl:flex")}>
          {c.needs_approval ? <NeedsApprovalBadge /> : <span className="text-sm text-muted-foreground">No</span>}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums xl:text-right xl:text-sm xl:text-foreground">
          <span className="xl:hidden">{fieldCount === 0 ? "No extra fields" : `${fieldCount} extra ${fieldCount === 1 ? "field" : "fields"}`}</span>
          <span className="hidden xl:inline">{fieldCount === 0 ? "—" : fieldCount}</span>
        </span>
        <div className={cn("flex", c.active && "hidden xl:flex")}>
          <ActiveBadge active={c.active} inactiveLabel="Inactive" />
        </div>
      </div>

      <ChevronRight aria-hidden className="absolute top-1/2 right-4 hidden size-4 -translate-y-1/2 text-muted-foreground/60 xl:static xl:block xl:translate-y-0" />
    </ListRow>
  );
}
