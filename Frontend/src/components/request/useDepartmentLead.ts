import { useEffect, useState } from "react";
import { listDepartments } from "@/services/departments";

/** Leads change rarely: one shared request per minute for every "Thandi Mthembu approves" on screen */
const TTL_MS = 60_000;
let cached: { at: number; leads: Promise<Map<string, string | null>> } | null = null;

const departmentLeads = (): Promise<Map<string, string | null>> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.leads;
  const leads = listDepartments({ limit: 100 }).then(
    (res) =>
      new Map(
        res.departments.map((d) => [
          String(d.department_id),
          d.departmentLead?.trim() || [d.lead_name, d.lead_surname].filter(Boolean).join(" ") || null,
        ]),
      ),
  );
  cached = { at: Date.now(), leads };
  leads.catch(() => {
    if (cached?.leads === leads) cached = null;
  });
  return leads;
};

/**
 * The name of a department's lead, the person who approves its approval requests (S6, p.39-41):
 * "Thandi Mthembu". Uses GET /api/departments (open to everyone signed in). Null until loaded,
 * when the department has no lead, or when the list can't load (the wording then says "the lead").
 */
export function useDepartmentLead(departmentId: number | string | null | undefined): string | null {
  const key = departmentId === null || departmentId === undefined ? null : String(departmentId);
  const [loaded, setLoaded] = useState<{ id: string; name: string | null } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    departmentLeads()
      .then((leads) => !cancelled && setLoaded({ id: key, name: leads.get(key) ?? null }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key !== null && loaded?.id === key ? loaded.name : null;
}

/** "IT Support" -> "IT lead", "Human Resources" -> "HR lead" (p.39 "Thandi Mthembu (IT lead)") */
export function leadTitle(departmentName: string | null | undefined): string {
  const name = departmentName?.trim();
  if (!name) return "department lead";
  const short: Record<string, string> = { "IT Support": "IT", "Human Resources": "HR" };
  return `${short[name] ?? name} lead`;
}
