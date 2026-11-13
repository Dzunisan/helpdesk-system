import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, Plus, SearchX, Zap } from "lucide-react";
import { toast } from "sonner";
import { createMacro, listMacros, updateMacro } from "@/services/macros";
import type { CreateMacroRequest, Macro } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { useApiData } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { SearchInput } from "@/components/app/Toolbar";
import { ListBody, ListCard, ListRow, LoadingRows } from "@/components/app/ListCard";
import MacroEditor from "@/components/lead/MacroEditor";
import { thenLabel } from "@/components/lead/macroText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NEW = "new";
const ITEM_GRID = "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-3";

const loadMacros = () => listMacros({ include_inactive: true });

/**
 * S7 Macros manager (briefing p.16, p.58): /department-lead/macros. A two-pane manager: the
 * department's saved replies with usage counts on the left, the editor on the right.
 * ?macro=<id> (or ?macro=new) picks the one being edited, so phones show one pane at a time.
 */
export default function MacrosManager() {
  const { user } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const macros = useApiData(loadMacros, "macros-manager");
  const all = useMemo(() => macros.data ?? [], [macros.data]);

  const selectedParam = searchParams.get("macro");
  const isNew = selectedParam === NEW;
  // Wide screens open the most used macro by default; phones start on the list
  const selected = isNew ? null : (all.find((m) => String(m.id) === selectedParam) ?? null);
  const editing = selected ?? (isNew ? null : all.find((m) => m.active) ?? null);
  const showEditorOnPhone = isNew || selected !== null;

  const select = (id: number | typeof NEW | null) => {
    const next = new URLSearchParams(searchParams);
    if (id === null) next.delete("macro");
    else next.set("macro", String(id));
    setSearchParams(next, { replace: id === null });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (m: Macro) => !q || m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q);
    const byUse = (a: Macro, b: Macro) => b.use_count - a.use_count || a.title.localeCompare(b.title);
    return {
      active: all.filter((m) => m.active && match(m)).sort(byUse),
      inactive: all.filter((m) => !m.active && match(m)).sort(byUse),
    };
  }, [all, search]);

  const replace = (saved: Macro) =>
    macros.setData((list) => (list ? (list.some((m) => m.id === saved.id) ? list.map((m) => (m.id === saved.id ? saved : m)) : [...list, saved]) : [saved]));

  const save = async (body: CreateMacroRequest) => {
    if (editing === null || isNew) {
      const created = await createMacro(body);
      replace(created);
      select(created.id);
      toast.success("Macro created", { description: `${departmentName ?? "Your"} agents can insert "${created.title}" now.` });
    } else {
      const saved = await updateMacro(editing.id, body);
      replace(saved);
      toast.success("Macro saved");
    }
  };

  const setActive = async (macro: Macro, active: boolean) => {
    try {
      const saved = await updateMacro(macro.id, { active });
      replace(saved);
      toast.success(active ? "Macro reactivated" : "Macro deactivated", {
        description: active ? "Agents can insert it again." : "Agents won't see it in the picker. Its use count is kept.",
      });
    } catch (err) {
      toast.error(active ? "Couldn't reactivate the macro" : "Couldn't deactivate the macro", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const count = filtered.active.length + filtered.inactive.length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Macros"
        description={departmentName ? `Saved replies for ${departmentName} agents` : "Saved replies for your agents"}
        actions={
          <Button onClick={() => select(NEW)} className="h-10 sm:h-9">
            <Plus data-icon="inline-start" />
            New macro
          </Button>
        }
      />

      {macros.error && !macros.data ? (
        <ErrorState
          title="Couldn't load the macros"
          description={macros.error.status === 0 ? undefined : macros.error.message}
          onRetry={macros.reload}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          {/* Left: the list (hidden on phones while editing) */}
          <div className={cn("flex min-w-0 flex-col gap-3", showEditorOnPhone && "hidden lg:flex")}>
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search macros" className="sm:w-full" />
            <ListCard>
              {macros.loading ? (
                <LoadingRows grid={ITEM_GRID} breakpoint="sm" rows={5} columns={["icon", "title", "meta"]} />
              ) : all.length === 0 ? (
                <EmptyState
                  icon={Zap}
                  size="compact"
                  title="No macros yet"
                  description="Save the replies your agents type most, like password reset steps."
                  action={
                    <Button variant="outline" onClick={() => select(NEW)}>
                      <Plus data-icon="inline-start" />
                      New macro
                    </Button>
                  }
                />
              ) : count === 0 ? (
                <EmptyState
                  icon={SearchX}
                  size="compact"
                  title="No macros match"
                  description="Try another word from the title or the reply."
                  action={
                    <Button variant="outline" onClick={() => setSearch("")}>
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <>
                  <ListBody>
                    {filtered.active.map((m) => (
                      <MacroItem key={m.id} macro={m} selected={!isNew && editing?.id === m.id} />
                    ))}
                  </ListBody>
                  {filtered.inactive.length > 0 && (
                    <>
                      <p className="border-y border-border bg-muted/40 px-6 py-2.5 text-xs font-medium text-muted-foreground">
                        Deactivated
                      </p>
                      <ListBody>
                        {filtered.inactive.map((m) => (
                          <MacroItem key={m.id} macro={m} selected={!isNew && editing?.id === m.id} />
                        ))}
                      </ListBody>
                    </>
                  )}
                </>
              )}
            </ListCard>
          </div>

          {/* Right: the editor (on phones only once a macro is picked) */}
          <div className={cn("min-w-0 flex-col gap-3", showEditorOnPhone ? "flex" : "hidden lg:flex")}>
            <Button variant="ghost" size="sm" onClick={() => select(null)} className="-ml-2 self-start text-muted-foreground lg:hidden">
              <ChevronLeft data-icon="inline-start" />
              All macros
            </Button>
            {macros.loading ? null : isNew || editing ? (
              <SectionCard title={isNew ? "New macro" : editing!.title}>
                <MacroEditor
                  key={isNew ? NEW : editing!.id}
                  macro={isNew ? null : editing}
                  departmentName={departmentName}
                  onSave={save}
                  onSetActive={editing && !isNew ? (active) => setActive(editing, active) : undefined}
                  onCancelNew={() => select(null)}
                />
              </SectionCard>
            ) : (
              all.length > 0 && (
                <EmptyState
                  variant="card"
                  icon={Zap}
                  title="Pick a macro to edit"
                  description="Or create a new one for a reply your agents type often."
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MacroItem({ macro: m, selected }: { macro: Macro; selected: boolean }) {
  return (
    <ListRow
      grid={ITEM_GRID}
      to={`?macro=${m.id}`}
      selected={selected}
      className={cn("py-4", !m.active && "opacity-70")}
      aria-label={`${m.title}, ${thenLabel(m.set_status)}, used ${m.use_count} times`}
    >
      <Zap className={cn("mt-0.5 size-4", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium text-foreground">{m.title}</span>
        <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          {thenLabel(m.set_status)}
          {m.is_internal && (
            <Badge variant="outline" className="h-4.5 border-warning-border bg-warning-muted px-1.5 text-[10px] text-warning-strong">
              Internal
            </Badge>
          )}
        </span>
      </span>
      <span className="pt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {m.use_count} {m.use_count === 1 ? "use" : "uses"}
      </span>
    </ListRow>
  );
}
