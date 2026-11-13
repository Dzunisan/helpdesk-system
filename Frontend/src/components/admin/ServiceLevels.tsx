import { useState } from "react";
import { getReportSummary } from "@/services/reports";
import { useApiData } from "@/hooks/useApiData";
import type { AdminOverviewDepartment } from "@/services/reportService";
import ErrorState from "@/components/app/ErrorState";
import ReportKpiTiles from "@/components/lead/ReportKpiTiles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";
const DAYS = 30;

/**
 * The S8 KPI tiles on the System Admin overview (briefing p.17 step 6, p.60): the lead dashboard's
 * six numbers for the whole organisation or one department, aggregates only (no ticket lists, so
 * HR stays private). GET /api/reports/summary?department_id=.
 */
export default function ServiceLevels({ departments }: { departments: AdminOverviewDepartment[] }) {
  const [department, setDepartment] = useState<string>(ALL);
  const departmentId = department === ALL ? undefined : Number(department);
  const summary = useApiData(() => getReportSummary({ department_id: departmentId, days: DAYS }), `admin-summary-${department}`);
  const active = departments.filter((d) => d.status === "active");
  const name = active.find((d) => d.department_id === departmentId)?.department_name;

  return (
    <section aria-labelledby="service-levels" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id="service-levels" className="text-base font-semibold tracking-tight text-foreground">
            Service levels
          </h2>
          <p className="text-sm text-muted-foreground">
            {name ?? "All departments"} · last {DAYS} days · counts and averages only
          </p>
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger aria-label="Department" className="h-10 w-full sm:h-9 sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={ALL}>All departments</SelectItem>
            {active.map((d) => (
              <SelectItem key={d.department_id} value={String(d.department_id)}>
                {d.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {summary.error && !summary.data ? (
        <ErrorState
          title="Couldn't load the service levels"
          description={summary.error.status === 0 ? undefined : summary.error.message}
          onRetry={summary.reload}
        />
      ) : (
        <ReportKpiTiles summary={summary.data} loading={summary.loading} />
      )}
    </section>
  );
}
