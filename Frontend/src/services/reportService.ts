import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

export interface AdminOverviewDepartment {
  department_id: number;
  department_name: string;
  status: string;
  lead_id: string | null;
  lead_name: string | null;
  agents: number;
  open_tickets: number;
}

export interface AdminOverview {
  totals: {
    active_users: number;
    inactive_users: number;
    active_departments: number;
    inactive_departments: number;
    open_tickets: number;
  };
  departments: AdminOverviewDepartment[];
  checklist: {
    departments_without_lead: { department_id: number; department_name: string }[];
    users_without_department: number;
  };
}

/**
 * Organisation counts for the System Admin overview.
 * GET /api/reports/admin-overview (System Admin only; counts, never ticket content)
 */
export const fetchAdminOverview = async (): Promise<AdminOverview> => {
  try {
    const response = await api.get<AdminOverview>("/reports/admin-overview");
    return response.data;
  } catch (error) {
    const message =
      error instanceof AxiosError
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
    throw new Error(message || "Could not load the overview.", { cause: error });
  }
};
