/**
 * S8 lead dashboard reports and S10 CSAT report (docs/api-sprint-2.md "S8", "S10"). A lead always
 * gets their own department (department_id is ignored); a System Admin may pass department_id.
 * The System Admin overview (GET /api/reports/admin-overview) stays in services/reportService.ts.
 */
import { api, call } from "./apiClient";
import type {
  BreachesResponse,
  CsatReport,
  DailyResponse,
  ReportParams,
  ReportSummary,
  WorkloadResponse,
} from "@/types/api";

/** GET /api/reports/summary: backlog, unassigned, breached, averages, CSAT, pending approvals */
export const getReportSummary = (params: ReportParams = {}) =>
  call(() => api.get<ReportSummary>("/reports/summary", { params }), "Couldn't load the dashboard numbers.");

/** GET /api/reports/workload: open / waiting / breached / resolved 7d per agent */
export const getWorkload = (params: ReportParams = {}) =>
  call(() => api.get<WorkloadResponse>("/reports/workload", { params }), "Couldn't load the team workload.");

/** GET /api/reports/breaches: top 10 overdue and due-soon tickets */
export const getBreaches = (params: ReportParams = {}) =>
  call(() => api.get<BreachesResponse>("/reports/breaches", { params }), "Couldn't load breached tickets.");

/** GET /api/reports/daily?days=14: created vs resolved per day */
export const getDaily = (params: ReportParams = { days: 14 }) =>
  call(() => api.get<DailyResponse>("/reports/daily", { params }), "Couldn't load the daily chart.");

/** GET /api/reports/csat?days=30: CSAT %, by agent, recent comments (S10) */
export const getCsatReport = (params: ReportParams = { days: 30 }) =>
  call(() => api.get<CsatReport>("/reports/csat", { params }), "Couldn't load CSAT.");
