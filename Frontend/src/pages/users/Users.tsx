import { useAuth } from "@/context/AuthContext";
import StaffUsers from "./StaffUsers";
import SystemAdmins from "./SystemAdmins";

/**
 * /system-admin/users and /platform-admin/users share this route component.
 * GET /api/users scopes the list by the signed-in admin's role:
 * a Platform Admin sees System Admins (briefing p.67), a System Admin sees everyone else (p.61).
 */
export default function Users() {
  const { user } = useAuth();
  return user?.role === "Platform Admin" ? <SystemAdmins /> : <StaffUsers />;
}
