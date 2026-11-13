import { useEffect, useState } from "react";
import { listDepartments } from "@/services/departments";

/** Department names change rarely: one shared request per minute for every label on screen */
const TTL_MS = 60_000;
let cached: { at: number; names: Promise<Map<string, string>> } | null = null;

const departmentNames = (): Promise<Map<string, string>> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.names;
  const names = listDepartments({ limit: 100 }).then(
    (res) => new Map(res.departments.map((d) => [String(d.department_id), d.department_name])),
  );
  cached = { at: Date.now(), names };
  // A failed load is forgotten so the next label tries again
  names.catch(() => {
    if (cached?.names === names) cached = null;
  });
  return names;
};

/**
 * The name of a department, for labels such as "Agent · IT Support".
 * Uses GET /api/departments (open to every signed-in user), shared by every caller; null until
 * loaded or when unknown.
 */
export const useDepartmentName = (departmentId: number | string | null | undefined) => {
  const [loaded, setLoaded] = useState<{ id: string; name: string | null } | null>(null);
  const key = departmentId === null || departmentId === undefined ? null : String(departmentId);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    departmentNames()
      .then((names) => !cancelled && setLoaded({ id: key, name: names.get(key) ?? null }))
      .catch(() => {
        // A label is not worth an error message; the layout just shows the role
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key !== null && loaded?.id === key ? loaded.name : null;
};
