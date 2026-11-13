import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/context/UsersContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { fullName } from "@/lib/roles";
import { formatSast } from "@/lib/format";
import PageHeader from "@/components/app/PageHeader";
import ProfileDetailsCard, { ProfileDetailsSkeleton } from "@/components/profile/ProfileDetailsCard";
import ChangePasswordCard from "@/components/profile/ChangePasswordCard";
import EditNameDialog from "@/components/profile/EditNameDialog";
import SectionCard from "@/components/app/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";

/** /api/auth/me also returns when the account was created */

type Action = "name" | "password";

/** Your profile (briefing p.68): the same page inside every role's shell */
export default function UserProfile() {
  const { user, checkAuth, updateAuthUser } = useAuth();
  const { updateUser, actionLoading, error: usersError, clearError } = useUsers();
  const departmentName = useDepartmentName(user?.department_id);

  const [editingName, setEditingName] = useState(false);
  // Which save the shared UsersContext error belongs to; never show a background users-list error here
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [localError, setLocalError] = useState<{ action: Action; message: string } | null>(null);

  // Refresh the session user so name and department are current
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const userId = user?.user_id || user?.id;

  const errorFor = (action: Action): string | null => {
    if (localError?.action === action) return localError.message;
    return lastAction === action ? usersError : null;
  };

  const save = async (action: Action, payload: { name?: string; surname?: string; password?: string }) => {
    setLocalError(null);
    clearError();
    setLastAction(action);
    if (!userId) {
      setLocalError({ action, message: "We couldn't find your account. Sign out and sign in again." });
      return null;
    }
    return updateUser(userId, payload);
  };

  const handleSaveName = async (name: string, surname: string) => {
    const updated = await save("name", { name, surname });
    if (!updated) return false;
    updateAuthUser({ name: updated.name, surname: updated.surname });
    setEditingName(false);
    setLastAction(null);
    toast.success("Name updated");
    return true;
  };

  const handleChangePassword = async (password: string) => {
    const updated = await save("password", { password });
    if (!updated) return false;
    setLastAction(null);
    toast.success("Password updated", { description: "Use it the next time you sign in." });
    return true;
  };

  const header = <PageHeader title="Your profile" description="How you appear to the support team, and your sign-in password." />;
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

  const createdAt = user.created_at;

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className={grid}>
        <ProfileDetailsCard
          className="xl:col-span-3"
          details={{
            fullName: fullName(user),
            email: user.email ?? "",
            role: user.role ?? "Employee",
            departmentName,
            hasDepartment: user.department_id !== null && user.department_id !== undefined,
            memberSince: formatSast(createdAt, "date"),
          }}
          onEditName={() => {
            setLocalError(null);
            setLastAction(null);
            setEditingName(true);
          }}
        />

        <ChangePasswordCard
          className="xl:col-span-2"
          email={user.email ?? ""}
          onSubmit={handleChangePassword}
          saving={actionLoading && lastAction === "password"}
          error={errorFor("password")}
        />
      </div>

      <EditNameDialog
        open={editingName}
        onOpenChange={setEditingName}
        initialName={user.name ?? ""}
        initialSurname={user.surname ?? ""}
        onSave={handleSaveName}
        saving={actionLoading && lastAction === "name"}
        error={errorFor("name")}
      />
    </div>
  );
}
