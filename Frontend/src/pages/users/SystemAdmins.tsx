import { Clock, KeyRound, MailCheck, Plus, ShieldCheck, Trash2, UserRoundCheck, UserRoundX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUsers, type User } from "@/context/UsersContext";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ActiveBadge } from "@/components/admin/AdminBadges";
import AddUserSheet from "@/components/admin/AddUserSheet";
import RowMenu from "@/components/admin/RowMenu";
import { fullNameOf, useAccountActions, userIdOf } from "@/components/admin/useAccountActions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useState } from "react";

const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_8rem_9.5rem] lg:items-center lg:gap-6";

/** Platform-wide rules, as the server enforces them today (backend utils/passwordRules, 1-hour session cookie) */
const POLICIES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: KeyRound, title: "Password policy", body: "8+ characters, upper- and lower-case letters and a number. The same everywhere." },
  { icon: Clock, title: "Session length", body: "1 hour, then sign in again. Deactivating an account blocks its next sign-in." },
  { icon: MailCheck, title: "New accounts", body: "Get a temporary password by email and can reset it from the sign-in page." },
];

/** Platform Admin › System admins (briefing p.67): the short list of people who configure Helpdesk. */
export default function SystemAdmins() {
  const { users: admins, loading, error, fetchUsers } = useUsers();
  const actions = useAccountActions();
  const [addOpen, setAddOpen] = useState(false);

  const firstLoad = loading && admins.length === 0;
  const loadFailed = !!error && !loading && admins.length === 0;
  const sorted = [...admins].sort((a, b) => Number(b.active) - Number(a.active) || fullNameOf(a).localeCompare(fullNameOf(b)));
  const active = admins.filter((a) => a.active).length;

  const addButton = (
    <Button onClick={() => setAddOpen(true)}>
      <Plus data-icon="inline-start" />
      Add system admin
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="System admins"
        description="People who configure Helpdesk for Mzansi Freight"
        actions={addButton}
      />

      {loadFailed ? (
        <ErrorState title="Couldn't load the system admins" onRetry={() => fetchUsers()} retrying={loading} />
      ) : (
        <div className="flex flex-col gap-3">
          <ListCard>
            <ListHeaderRow grid={GRID}>
              <span>Name</span>
              <span>Status</span>
              <span>Added</span>
              <span className="sr-only">Actions</span>
            </ListHeaderRow>
            {firstLoad ? (
              <LoadingRows grid={GRID} breakpoint="lg" columns={["avatar", "badge", "meta", "button"]} />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No system admins yet"
                description="Add someone to set up departments and staff for the company."
                action={addButton}
              />
            ) : (
              <ListBody>
                {sorted.map((admin) => (
                  <AdminRow
                    key={userIdOf(admin)}
                    admin={admin}
                    busy={actions.busy}
                    onDeactivate={() => actions.requestDeactivate(admin)}
                    onReactivate={() => actions.reactivate(admin)}
                    onDelete={() => actions.requestDelete(admin)}
                  />
                ))}
              </ListBody>
            )}
          </ListCard>
          {!firstLoad && admins.length > 0 && (
            <ListCaption>
              {admins.length} system {admins.length === 1 ? "admin" : "admins"} · {active} active
            </ListCaption>
          )}
        </div>
      )}

      <section aria-label="Platform rules" className="grid gap-4 md:grid-cols-3">
        {POLICIES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="flex-row items-start gap-4 border border-border p-6 shadow-none ring-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="text-sm text-pretty text-muted-foreground">{body}</p>
            </div>
          </Card>
        ))}
      </section>

      <AddUserSheet open={addOpen} onOpenChange={setAddOpen} />
      {actions.dialogs}
    </div>
  );
}

interface AdminRowProps {
  admin: User;
  busy: boolean;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function AdminRow({ admin, busy, onDeactivate, onReactivate, onDelete }: AdminRowProps) {
  const name = fullNameOf(admin);
  return (
    <ListRow grid={GRID} className="relative">
      <div className={cn("flex min-w-0 items-center gap-3 pr-10 lg:pr-0", !admin.active && "opacity-60")}>
        <UserAvatar name={name} />
        <div className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-11 lg:contents">
        <div>
          <ActiveBadge active={admin.active} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums lg:text-sm">
          <span className="lg:hidden">Added </span>
          {formatSast(admin.created_at, "date")}
        </span>
      </div>

      <div className="absolute top-4 right-4 flex items-center justify-end gap-1 lg:static lg:-mr-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="relative z-10 hidden lg:inline-flex"
          onClick={admin.active ? onDeactivate : onReactivate}
        >
          {admin.active ? "Deactivate" : "Reactivate"}
        </Button>
        <RowMenu label={`Actions for ${name}`} disabled={busy}>
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{name}</DropdownMenuLabel>
          {admin.active ? (
            <DropdownMenuItem onSelect={onDeactivate} className="lg:hidden">
              <UserRoundX />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReactivate} className="lg:hidden">
              <UserRoundCheck />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="lg:hidden" />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete account
          </DropdownMenuItem>
        </RowMenu>
      </div>
    </ListRow>
  );
}
