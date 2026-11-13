import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { appointLead } from "@/services/departments";
import { updateUser } from "@/services/users";
import { toApiError } from "@/services/apiClient";
import type { User } from "@/types/api";
import UserAvatar from "@/components/app/UserAvatar";
import EmptyState from "@/components/app/EmptyState";
import { givenNameOf, fullNameOf } from "@/components/admin/users";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** The department the dialog appoints a lead for */
export interface LeadTarget {
  department_id: number;
  department_name: string;
  /** The current lead, if any */
  lead_id: string | null;
  lead_name: string | null;
}

/** Someone the System Admin may appoint, and what changes for them */
interface Candidate {
  user: User;
  /** "Agent → will become lead", "Department lead · not leading" */
  note: string;
  /** Their role changes from Agent to Department Lead first */
  promote: boolean;
  /** Their department changes to this one (a lead from another department) */
  moves: string | null;
}

interface AppointLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: LeadTarget | null;
  /** Every Employee, Agent and Lead (GET /api/users); null while loading */
  users: User[] | null;
  /** department_id -> name, for "Department lead in Finance" */
  departmentNames: Map<number, string>;
  /** User ids that already lead a department (from the department list) */
  leaderIds: Set<string>;
  /** After a successful appointment, so the page can reload its rows */
  onAppointed: () => void;
}

/**
 * "Appoint lead for Facilities" (briefing p.62, S1 flow step 3). Only eligible people are listed:
 * the department's active agents (promoted to Department lead) and active Department leads who
 * lead no other department. PUT /api/departments/:id/lead also sets the lead's department.
 */
export default function AppointLeadDialog({
  open,
  onOpenChange,
  department,
  users,
  departmentNames,
  leaderIds,
  onAppointed,
}: AppointLeadDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo<Candidate[]>(() => {
    if (!department || !users) return [];
    const isHere = (u: User) => u.department_id === department.department_id;
    const leading = (u: User) => u.led_department_id != null || leaderIds.has(u.user_id);
    return users
      .filter((u) => u.active && u.user_id !== department.lead_id)
      .flatMap<Candidate>((u) => {
        if (u.role === "Agent" && isHere(u)) {
          return [{ user: u, note: "Agent → will become lead", promote: true, moves: null }];
        }
        if (u.role === "Department Lead" && !leading(u)) {
          const from = u.department_id != null && !isHere(u) ? departmentNames.get(u.department_id) ?? null : null;
          return [
            {
              user: u,
              note: from ? `Department lead in ${from} · not leading` : "Department lead · not leading",
              promote: false,
              moves: from,
            },
          ];
        }
        return [];
      })
      .sort((a, b) => Number(a.promote) - Number(b.promote) || fullNameOf(a.user).localeCompare(fullNameOf(b.user)));
  }, [department, users, leaderIds, departmentNames]);

  const selected = candidates.find((c) => c.user.user_id === selectedId) ?? null;

  const reset = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setSelectedId(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const appoint = async () => {
    if (!department || !selected) return;
    setSaving(true);
    setError(null);
    try {
      // An agent becomes a Department Lead first; the lead endpoint only accepts leads
      if (selected.promote) {
        await updateUser(selected.user.user_id, { role: "Department Lead", department_id: department.department_id });
      }
      await appointLead(department.department_id, selected.user.user_id);
      toast.success(`${fullNameOf(selected.user)} now leads ${department.department_name}`);
      onAppointed();
      setSelectedId(null);
      onOpenChange(false);
    } catch (err) {
      setError(toApiError(err, "Couldn't appoint the lead.").message);
    } finally {
      setSaving(false);
    }
  };

  const name = department?.department_name ?? "this department";

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 pr-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <UserRoundPlus className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              {department?.lead_id ? `Change lead for ${name}` : `Appoint lead for ${name}`}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              Only people who don&apos;t already lead a department are shown.
            </DialogDescription>
          </div>
        </DialogHeader>

        {users === null ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading people">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                <Skeleton className="size-8 rounded-full bg-foreground/[0.07]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32 bg-foreground/[0.07]" />
                  <Skeleton className="h-3 w-40 bg-foreground/[0.07]" />
                </div>
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            size="compact"
            variant="card"
            className="py-8"
            title="No one can lead this department yet"
            description={`Add an agent to ${name}, or a Department lead who doesn't lead anywhere else.`}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/system-admin/users">Go to users</Link>
              </Button>
            }
          />
        ) : (
          <Command className="rounded-lg border border-border bg-background p-1">
            <CommandInput placeholder={`Search people in ${name}`} />
            <CommandList className="max-h-64 pt-1">
              <CommandEmpty>No one by that name.</CommandEmpty>
              <CommandGroup className="p-0">
                {candidates.map((c) => {
                  const isSelected = c.user.user_id === selectedId;
                  return (
                    <CommandItem
                      key={c.user.user_id}
                      value={`${fullNameOf(c.user)} ${c.user.email}`}
                      data-checked={isSelected}
                      onSelect={() => setSelectedId(c.user.user_id)}
                      className="my-0.5 gap-3 border border-transparent px-2.5 py-2 data-[checked=true]:border-primary/40 data-[checked=true]:bg-secondary [&>svg:last-child]:text-primary"
                    >
                      <UserAvatar name={fullNameOf(c.user)} description={c.note} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {selected && department && (
          <p className="rounded-lg bg-muted/60 px-3.5 py-3 text-xs text-pretty text-muted-foreground">
            {selected.promote
              ? `${givenNameOf(selected.user)}'s role changes from Agent to Department lead, and they lead ${name} from now on.`
              : selected.moves
                ? `${givenNameOf(selected.user)}'s department changes from ${selected.moves} to ${name}, and they lead it from now on.`
                : `${givenNameOf(selected.user)} leads ${name} from now on, and their department is set to ${name}.`}
            {department.lead_name && ` ${department.lead_name} stays a Department lead but no longer leads ${name}.`}
          </p>
        )}

        {error && (
          <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button variant="outline" className="h-10 sm:h-9" onClick={() => reset(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="h-10 sm:h-9" onClick={appoint} disabled={!selected || saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {selected ? `Appoint ${givenNameOf(selected.user)}` : "Appoint lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
