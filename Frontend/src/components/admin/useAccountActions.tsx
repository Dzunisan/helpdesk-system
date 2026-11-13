import { useState } from "react";
import { Trash2, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { useUsers, type User } from "@/context/UsersContext";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

export const fullNameOf = (u: Pick<User, "name" | "surname">) => `${u.name ?? ""} ${u.surname ?? ""}`.trim() || u.name || "This user";
export const userIdOf = (u: User) => u.user_id || u.id || "";

/**
 * Deactivate / reactivate / delete for a user row, with the confirmations (briefing p.61:
 * "Deactivate / Reactivate replaces Delete"; Delete is kept, behind its own warning).
 * Same calls as before: toggleUserStatus and deleteUser from UsersContext.
 *
 * @example const actions = useAccountActions(); … actions.requestDeactivate(user) … {actions.dialogs}
 */
export function useAccountActions() {
  const { toggleUserStatus, deleteUser, actionLoading } = useUsers();
  // The target stays set while the dialog animates closed, so its text doesn't flicker
  const [pending, setPending] = useState<{ kind: "deactivate" | "delete"; user: User } | null>(null);
  const [open, setOpen] = useState(false);
  const ask = (kind: "deactivate" | "delete", user: User) => {
    setPending({ kind, user });
    setOpen(true);
  };

  const reactivate = async (user: User) => {
    const updated = await toggleUserStatus(userIdOf(user), false);
    if (updated) toast.success(`${fullNameOf(user)} can sign in again`);
    else toast.error(`Couldn't reactivate ${fullNameOf(user)}`, { description: "Please try again." });
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    setOpen(false);
    const name = fullNameOf(user);
    if (kind === "deactivate") {
      const updated = await toggleUserStatus(userIdOf(user), true);
      if (updated) toast.success(`${name} was deactivated`, { description: "They can't sign in until you reactivate them." });
      else toast.error(`Couldn't deactivate ${name}`, { description: "Please try again." });
    } else {
      const ok = await deleteUser(userIdOf(user));
      if (ok) toast.success(`${name} was deleted`);
      else toast.error(`Couldn't delete ${name}`, { description: "Please try again." });
    }
  };

  const name = pending ? fullNameOf(pending.user) : "";
  const firstName = pending?.user.name || name;

  const dialogs = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      icon={pending?.kind === "delete" ? Trash2 : UserRoundX}
      destructive
      title={pending?.kind === "delete" ? `Delete ${name}?` : `Deactivate ${name}?`}
      description={
        pending?.kind === "delete" ? (
          <>
            Their account is removed for good. This can&apos;t be undone. If {firstName} might come back, deactivate
            the account instead.
          </>
        ) : (
          <>
            {firstName} can&apos;t sign in until you reactivate the account. Their tickets and history stay as they
            are.
          </>
        )
      }
      cancelLabel={pending?.kind === "delete" ? "Keep user" : "Cancel"}
      confirmLabel={pending?.kind === "delete" ? "Delete user" : "Deactivate"}
      onConfirm={confirm}
    />
  );

  return {
    busy: actionLoading,
    requestDeactivate: (user: User) => ask("deactivate", user),
    requestDelete: (user: User) => ask("delete", user),
    reactivate,
    dialogs,
  };
}
