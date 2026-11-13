import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { changePassword, updateOwnName } from "@/services/users";
import { toApiError } from "@/services/apiClient";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { fullName } from "@/lib/roles";
import { formatSast } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import ProfileDetailsCard, { ProfileDetailsSkeleton } from "@/components/profile/ProfileDetailsCard";
import ChangePasswordCard from "@/components/profile/ChangePasswordCard";
import EditNameDialog from "@/components/profile/EditNameDialog";
import SectionCard from "@/components/app/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import NotificationPrefsCard from "./NotificationPrefsCard";

type Action = "name" | "password";

/**
 * Your profile (briefing p.68): the same page inside every role's shell. The name saves through
 * PUT /api/users/update (name and surname only); the password through POST /api/auth/change-password,
 * which checks the current password first.
 */
export default function UserProfile() {
  const { user, checkAuth, updateAuthUser } = useAuth();
  const departmentName = useDepartmentName(user?.department_id);

  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState<Action | null>(null);
  const [error, setError] = useState<{ action: Action; message: string } | null>(null);

  // The bell's "Notification settings" link lands on profile#notifications (p.51, p.68)
  const { hash } = useLocation();
  const notificationsRef = useRef<HTMLDivElement>(null);
  const hasUser = Boolean(user);
  useEffect(() => {
    if (hash === "#notifications" && hasUser) notificationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, hasUser]);

  // Refresh the session user so name and department are current
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const errorFor = (action: Action): string | null => (error?.action === action ? error.message : null);

  const handleSaveName = async (name: string, surname: string) => {
    setError(null);
    setSaving("name");
    try {
      const updated = await updateOwnName({ name, surname });
      updateAuthUser({ name: updated.name, surname: updated.surname });
      setEditingName(false);
      toast.success("Name updated");
      return true;
    } catch (err) {
      setError({ action: "name", message: toApiError(err, "Couldn't save your name.").message });
      return false;
    } finally {
      setSaving(null);
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    setError(null);
    setSaving("password");
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      toast.success("Password updated", { description: "Use it the next time you sign in." });
      return true;
    } catch (err) {
      setError({ action: "password", message: toApiError(err, "Couldn't change your password.").message });
      return false;
    } finally {
      setSaving(null);
    }
  };

  const header = (
    <PageHeader title="Your profile" description="How you appear to the support team, your notifications and your sign-in password." />
  );
  const grid = "grid gap-6 xl:grid-cols-5 xl:items-start";

  if (!user) {
    return (
      <div className="flex flex-col gap-8" aria-busy>
        {header}
        <div className={grid}>
          <ProfileDetailsSkeleton className="xl:col-span-3" />
          <SectionCard className="xl:col-span-2" contentClassName="flex flex-col gap-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-48" />
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className={grid}>
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-3">
        <ProfileDetailsCard
          details={{
            fullName: fullName(user),
            email: user.email ?? "",
            role: user.role ?? "Employee",
            departmentName,
            hasDepartment: user.department_id !== null && user.department_id !== undefined,
            memberSince: formatSast(user.created_at, "date"),
          }}
          onEditName={() => {
            setError(null);
            setEditingName(true);
          }}
        />
        <div id="notifications" ref={notificationsRef} className="scroll-mt-24">
          <NotificationPrefsCard />
        </div>
        </div>

        <ChangePasswordCard
          className="xl:col-span-2"
          email={user.email ?? ""}
          onSubmit={handleChangePassword}
          saving={saving === "password"}
          error={errorFor("password")}
        />
      </div>

      <EditNameDialog
        open={editingName}
        onOpenChange={setEditingName}
        initialName={user.name ?? ""}
        initialSurname={user.surname ?? ""}
        onSave={handleSaveName}
        saving={saving === "name"}
        error={errorFor("name")}
      />
    </div>
  );
}
