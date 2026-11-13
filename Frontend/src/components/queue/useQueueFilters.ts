import { useEffect, useState } from "react";
import { listCategories } from "@/services/categories";
import type { Category, TicketListParams, TicketPriority } from "@/types/api";

export const ANY = "any";
type PriorityFilter = typeof ANY | TicketPriority;
type SlaFilter = typeof ANY | "breached" | "due_soon";

export const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: ANY, label: "Any" },
  { value: "Urgent", label: "Urgent" },
  { value: "High", label: "High" },
  { value: "Normal", label: "Normal" },
  { value: "Low", label: "Low" },
];

export const SLA_OPTIONS: { value: SlaFilter; label: string }[] = [
  { value: ANY, label: "Any" },
  { value: "breached", label: "Breached" },
  { value: "due_soon", label: "Due soon" },
];

/** Waits `ms` after the last change, so typing in search doesn't send a request per key */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Filter state for a queue (briefing p.47 filter chips): priority, category, SLA and search.
 * Everything goes to the server as GET /api/tickets params; nothing filters in the browser.
 */
export function useQueueFilters() {
  const [priority, setPriority] = useState<PriorityFilter>(ANY);
  const [category, setCategory] = useState<string>(ANY);
  const [sla, setSla] = useState<SlaFilter>(ANY);
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());

  const active = priority !== ANY || category !== ANY || sla !== ANY || query !== "";
  const params: TicketListParams = {
    priority: priority === ANY ? undefined : priority,
    category_id: category === ANY ? undefined : Number(category),
    sla: sla === ANY ? undefined : sla,
    search: query || undefined,
  };

  const clear = () => {
    setPriority(ANY);
    setCategory(ANY);
    setSla(ANY);
    setSearch("");
  };

  return { priority, setPriority, category, setCategory, sla, setSla, search, setSearch, params, active, clear };
}

export type QueueFilterState = ReturnType<typeof useQueueFilters>;

/** Active categories of one department, for the Category chip */
export function useDepartmentCategories(departmentId: number | null | undefined): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((r) => {
        if (cancelled) return;
        const mine = departmentId ? r.categories.filter((c) => c.department_id === Number(departmentId)) : r.categories;
        setCategories([...mine].sort((a, b) => a.category_name.localeCompare(b.category_name)));
      })
      .catch(() => {
        // The chip still offers "Any"; the list itself shows any real error
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);
  return categories;
}

