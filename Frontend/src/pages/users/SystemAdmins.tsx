import { useState } from "react";
import { Clock, KeyRound, MailCheck, Pencil, Plus, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listUsers } from "@/services/users";
import type { User } from "@/types/api";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { ListBody, ListCaption, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { AccountStatusBadge } from "@/components/admin/AdminBadges";
import RowMenu from "@/components/admin/RowMenu";
import UserSheet from "@/components/admin/UserSheet";
import { useAccountActions } from "@/components/admin/useAccountActions";
import { useLoader } from "@/components/admin/useLoader";
import { accountStatusOf, byActiveThenName, fullNameOf } from "@/components/admin/users";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

/* Name · Status · Last sign-in · Added · actions */
const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_9.5rem] lg:items-center lg:gap-6";

/** Platform-wide rules, as the server enforces them today (backend utils/passwordRules, 1-hour session cookie) */
const POLICIES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: KeyRound, title: "Password policy", body: "8+ characters, upper- and lower-case letters and a number. The same everywhere." },
  { icon: Clock, title: "Session length", body: "1 hour, then sign in again. Deactivating an account blocks its very next request." },
  { icon: MailCheck, title: "New accounts", body: "Get a temporary password by email and choose their own at first sign-in." },
];

/** Platform Admin › System admins (briefing p.67): the short list of people who configure Helpdesk. */
export default function SystemAdmins() {
  // For a Platform Admin, GET /api/users returns System Admins only (docs/api-sprint-1.md S1)
  const users = useLoader(() => listUsers());
  const [sheet, setSheet] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });

  const upsert = (saved: User) =>
    users.setData((list) => {
      const current = list ?? [];
      return current.some((u) => u.user_id === saved.user_id)
        ? current.map((u) => (u.user_id === saved.user_id ? saved : u))
        : [saved, ...current];
    });
  const actions = useAccountActions(upsert);

  const admins = users.data ?? [];
  const firstLoad = users.loading && users.data === null;
  const loadFailed = !!users.error && users.data === null;
  const sorted = [...admins].sort(byActiveThenName);
  const active = admins.filter((a) => a.active).length;

  const addButton = (
    <Button onClick={() => setSheet({ open: true, user: null })}>
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
        <ErrorState
          title="Couldn't load the system admins"
          description={users.error?.message}
          onRetry={users.reload}
          retrying={users.loading}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ListCard>
            <ListHeaderRow grid={GRID}>
              <span>Name</span>
              <span>Status</span>
              <span>Last sign-in</span>
              <span>Added</span>
              <span className="sr-only">Actions</span>
            </ListHeaderRow>
            {firstLoad ? (
              <LoadingRows grid={GRID} breakpoint="lg" columns={["person", "badge", "meta", "meta", "button"]} />
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
                    key={admin.user_id}
                    admin={admin}
                    busy={actions.busy}
                    onEdit={() => setSheet({ open: true, user: admin })}
                    onDeactivate={() => actions.request("deactivate", admin)}
                    onReactivate={() => actions.request("reactivate", admin)}
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

      <UserSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        user={sheet.user}
        scope="admins"
        onSaved={upsert}
      />
      {actions.dialogs}
    </div>
  );
}

interface AdminRowProps {
  admin: User;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}

function AdminRow({ admin, busy, onEdit, onDeactivate, onReactivate }: AdminRowProps) {
  const name = fullNameOf(admin);
  const status = accountStatusOf(admin);
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
          <AccountStatusBadge status={status} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums lg:text-sm">
          {admin.last_login_at ? (
            <>
              <span className="lg:hidden">Last sign-in </span>
              {formatSast(admin.last_login_at, "smart")}
            </>
          ) : (
            <>
              <span className="lg:hidden">Never signed in</span>
              <span className="hidden lg:inline">Never</span>
            </>
          )}
        </span>
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
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator className="lg:hidden" />
          {admin.active ? (
            <DropdownMenuItem variant="destructive" onSelect={onDeactivate} className="lg:hidden">
              <UserRoundX />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReactivate} className="lg:hidden">
              <UserRoundCheck />
              Reactivate
            </DropdownMenuItem>
          )}
        </RowMenu>
      </div>
    </ListRow>
  );
}
