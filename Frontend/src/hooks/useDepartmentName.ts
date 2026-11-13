import { useEffect, useState } from "react";
import axios from "axios";

const API = `${import.meta.env.VITE_API_URL}/api`;

/**
 * The name of a department, for labels such as "Agent · IT Support".
 * Uses GET /api/departments (open to every signed-in user); null until loaded or when unknown.
 */
export const useDepartmentName = (departmentId: number | string | null | undefined) => {
  const [loaded, setLoaded] = useState<{ id: string; name: string | null } | null>(null);
  const key = departmentId === null || departmentId === undefined ? null : String(departmentId);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    axios
      .get<{ departments?: { department_id: number | string; department_name: string }[] }>(
        `${API}/departments`,
        { params: { limit: 100 }, withCredentials: true },
      )
      .then((res) => {
        if (cancelled) return;
        const match = res.data.departments?.find((d) => String(d.department_id) === key);
        setLoaded({ id: key, name: match?.department_name ?? null });
      })
      .catch(() => {
        // A label is not worth an error message; the layout just shows the role
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key !== null && loaded?.id === key ? loaded.name : null;
};
