import { useState } from "react";
import { UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { setUserActive } from "@/services/users";
import { toApiError } from "@/services/apiClient";
import type { User } from "@/types/api";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { givenNameOf, fullNameOf } from "@/components/admin/users";

/**
 * Deactivate / reactivate for a user row, each behind an AlertDialog (briefing p.61, S1:
 * "Deactivate / Reactivate replaces Delete"; there is no hard delete).
 * PATCH /api/users/:id/active. A deactivated user gets 401 on their very next request.
 *
 * @example const actions = useAccountActions(onSaved); … actions.request("deactivate", user) … {actions.dialogs}
 */
export function useAccountActions(onSaved: (user: User) => void) {
  // The target stays set while the dialog animates closed, so its text doesn't flicker
  const [pending, setPending] = useState<{ kind: "deactivate" | "reactivate"; user: User } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = (kind: "deactivate" | "reactivate", user: User) => {
    setPending({ kind, user });
    setOpen(true);
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    const name = fullNameOf(user);
    setOpen(false);
    setBusy(true);
    try {
      const saved = await setUserActive(user.user_id, kind === "reactivate");
      onSaved(saved);
      if (kind === "deactivate") {
        toast.success(`${name} was deactivated`, { description: "They're signed out on their next click and can't sign in again." });
      } else {
        toast.success(`${name} can sign in again`);
      }
    } catch (err) {
      toast.error(kind === "deactivate" ? `Couldn't deactivate ${name}` : `Couldn't reactivate ${name}`, {
        description: toApiError(err).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const name = pending ? fullNameOf(pending.user) : "";
  const first = pending ? givenNameOf(pending.user) : "";
  const deactivating = pending?.kind !== "reactivate";

  const dialogs = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      icon={deactivating ? UserRoundX : UserRoundCheck}
      destructive={deactivating}
      title={deactivating ? `Deactivate ${name}?` : `Reactivate ${name}?`}
      description={
        deactivating ? (
          <>
            {first} is signed out straight away and can&apos;t sign in until you reactivate the account. Their tickets
            and history stay as they are.
          </>
        ) : (
          <>{first} can sign in again with their existing password, with the same role and department as before.</>
        )
      }
      cancelLabel="Cancel"
      confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
      onConfirm={confirm}
    />
  );

  return { busy, request, dialogs };
}
