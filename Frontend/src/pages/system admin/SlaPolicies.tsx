import { useMemo, useState } from "react";
import { ArrowRight, Info, Timer } from "lucide-react";
import { toast } from "sonner";
import { listSlaPolicies, updateSlaPolicy } from "@/services/slaPolicies";
import { toApiError } from "@/services/apiClient";
import { TICKET_PRIORITIES, type SlaPolicy, type TicketPriority } from "@/types/api";
import { formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/app/PageHeader";
import SectionCard from "@/components/app/SectionCard";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { SlaChip } from "@/components/app/SlaChip";
import { ListBody, ListCard, ListHeaderRow, ListRow, LoadingRows } from "@/components/app/ListCard";
import { ComingBadge } from "@/components/admin/AdminBadges";
import { useLoader } from "@/components/admin/useLoader";
import {
  draftFromMinutes,
  formatMinutes,
  minutesOf,
  UNIT_LABEL,
  type DurationDraft,
  type DurationUnit,
} from "@/components/admin/slaDuration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/* Priority (+ what it's for) · First response within · Resolve within. Stacks below lg. */
const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_12rem] lg:items-center lg:gap-6";

const USE_FOR: Record<TicketPriority, string> = {
  Urgent: "Business stopped or many people affected",
  High: "One person fully blocked",
  Normal: "Default for new tickets",
  Low: "Questions, nice-to-haves",
};

/** "Due soon" threshold: fixed at 25% of the target in Sprint 1 (services/sla.ts on the server) */
const DUE_SOON_SHARE = 0.25;

/** The worked example from page 5: a ticket created Tue 10 Nov at 08:14 SAST */
const EXAMPLE_CREATED = Date.parse("2026-11-10T06:14:00.000Z");

const SA_HOLIDAYS = ["16 Dec · Day of Reconciliation", "25 Dec · Christmas Day", "26 Dec · Day of Goodwill", "1 Jan · New Year's Day", "21 Mar · Human Rights Day"];

interface Draft {
  first: DurationDraft;
  resolution: DurationDraft;
}

const draftOf = (p: SlaPolicy): Draft => ({
  first: draftFromMinutes(p.first_response_mins),
  resolution: draftFromMinutes(p.resolution_mins),
});

/** System Admin › SLA policies (briefing p.64, S3): first response and resolution targets per priority */
export default function SlaPolicies() {
  const policies = useLoader(listSlaPolicies);
  const [edits, setEdits] = useState<Partial<Record<TicketPriority, Draft>>>({});
  const [saving, setSaving] = useState(false);
  const [examplePriority, setExamplePriority] = useState<TicketPriority>("High");

  const byPriority = useMemo(
    () => new Map((policies.data ?? []).map((p) => [p.priority, p])),
    [policies.data],
  );

  /** Every row as shown: the admin's edit, or the saved policy */
  const rows = TICKET_PRIORITIES.flatMap((priority) => {
    const saved = byPriority.get(priority);
    if (!saved) return [];
    const draft = edits[priority] ?? draftOf(saved);
    const first = minutesOf(draft.first);
    const resolution = minutesOf(draft.resolution);
    const error =
      first === null
        ? "Enter a first response target above zero."
        : resolution === null
          ? "Enter a resolution target above zero."
          : resolution < first
            ? "Resolution can't be quicker than the first response."
            : null;
    const changed = first !== saved.first_response_mins || resolution !== saved.resolution_mins;
    return [{ priority, saved, draft, first, resolution, error, changed }];
  });

  const dirty = rows.some((r) => r.changed);
  const invalid = rows.some((r) => r.error);

  const edit = (priority: TicketPriority, part: keyof Draft, next: Partial<DurationDraft>) =>
    setEdits((current) => {
      const saved = byPriority.get(priority);
      if (!saved) return current;
      const base = current[priority] ?? draftOf(saved);
      return { ...current, [priority]: { ...base, [part]: { ...base[part], ...next } } };
    });

  const save = async () => {
    if (!dirty || invalid) return;
    setSaving(true);
    const changed = rows.filter((r) => r.changed);
    const done: SlaPolicy[] = [];
    try {
      for (const r of changed) {
        done.push(await updateSlaPolicy(r.priority, { first_response_mins: r.first!, resolution_mins: r.resolution! }));
      }
      toast.success(changed.length === 1 ? `${changed[0].priority} targets saved` : "SLA targets saved", {
        description: "New tickets and later priority changes use them. Existing due times stay as they are.",
      });
    } catch (err) {
      toast.error("Couldn't save every target", { description: toApiError(err).message });
    } finally {
      // Keep whatever was saved; failed rows stay edited so nothing typed is lost
      if (done.length) {
        policies.setData((list) => (list ?? []).map((p) => done.find((d) => d.priority === p.priority) ?? p));
        setEdits((current) => {
          const next = { ...current };
          for (const d of done) delete next[d.priority];
          return next;
        });
      }
      setSaving(false);
    }
  };

  const firstLoad = policies.loading && policies.data === null;
  const loadFailed = !!policies.error && policies.data === null;
  const example = rows.find((r) => r.priority === examplePriority);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="SLA policies"
        description="How quickly IT, HR, Facilities and Finance promise to respond and resolve"
        actions={
          !loadFailed && (
            <>
              {dirty && (
                <Button variant="outline" onClick={() => setEdits({})} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button onClick={save} disabled={!dirty || invalid || saving}>
                {saving && <Spinner data-icon="inline-start" />}
                Save changes
              </Button>
            </>
          )
        }
      />

      {loadFailed ? (
        <ErrorState
          title="Couldn't load the SLA policies"
          description={policies.error?.message}
          onRetry={policies.reload}
          retrying={policies.loading}
        />
      ) : (
        <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <ListCard>
              <ListHeaderRow grid={GRID}>
                <span>Priority</span>
                <span>First response within</span>
                <span>Resolve within</span>
              </ListHeaderRow>
              {firstLoad ? (
                <LoadingRows grid={GRID} breakpoint="lg" rows={4} columns={["title", "button", "button"]} />
              ) : rows.length === 0 ? (
                <EmptyState icon={Timer} title="No SLA policies yet" description="Run the database seed to create the four priority targets." />
              ) : (
                <ListBody>
                  {rows.map((r) => (
                    <ListRow key={r.priority} grid={GRID} className={cn(r.changed && "bg-accent/40")}>
                      <div className="flex min-w-0 flex-col items-start gap-1.5">
                        <PriorityBadge priority={r.priority} />
                        <span className="text-xs text-pretty text-muted-foreground">{USE_FOR[r.priority]}</span>
                        {r.error && <FieldError className="text-xs lg:hidden">{r.error}</FieldError>}
                      </div>
                      <DurationInput
                        id={`sla-${r.priority}-first`}
                        label="First response within"
                        draft={r.draft.first}
                        invalid={r.first === null}
                        disabled={saving}
                        onChange={(next) => edit(r.priority, "first", next)}
                      />
                      <DurationInput
                        id={`sla-${r.priority}-resolution`}
                        label="Resolve within"
                        draft={r.draft.resolution}
                        invalid={r.resolution === null || (r.first !== null && r.resolution < r.first)}
                        disabled={saving}
                        onChange={(next) => edit(r.priority, "resolution", next)}
                      />
                      {r.error && (
                        <FieldError className="col-span-3 -mt-2 hidden text-xs lg:block lg:text-right">{r.error}</FieldError>
                      )}
                    </ListRow>
                  ))}
                </ListBody>
              )}
            </ListCard>

            <WarningsCard resolutionMins={example?.resolution ?? example?.saved.resolution_mins ?? 480} priority={examplePriority} />
          </div>

          <div className="grid items-start gap-6 md:grid-cols-2 2xl:grid-cols-1">
            <ExampleCard
              priority={examplePriority}
              onPriorityChange={setExamplePriority}
              firstMins={example?.first ?? null}
              resolutionMins={example?.resolution ?? null}
              loading={firstLoad}
            />
            <BusinessHoursCard />
          </div>
        </div>
      )}
    </div>
  );
}

interface DurationInputProps {
  id: string;
  label: string;
  draft: DurationDraft;
  invalid: boolean;
  disabled?: boolean;
  onChange: (next: Partial<DurationDraft>) => void;
}

/** A number and a unit (minutes / hours / days); stored as whole minutes */
function DurationInput({ id, label, draft, invalid, disabled, onChange }: DurationInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground lg:sr-only">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          className="h-10 w-20 tabular-nums sm:h-9"
          value={draft.value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ value: e.target.value })}
        />
        <Select value={draft.unit} onValueChange={(unit) => onChange({ unit: unit as DurationUnit })} disabled={disabled}>
          <SelectTrigger aria-label={`${label} unit`} className="h-10 flex-1 sm:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {(Object.keys(UNIT_LABEL) as DurationUnit[]).map((u) => (
              <SelectItem key={u} value={u}>
                {UNIT_LABEL[u]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** "Due soon" threshold with a live example of each chip, using the example priority's resolution target */
function WarningsCard({ resolutionMins, priority }: { resolutionMins: number; priority: TicketPriority }) {
  // A fixed "now" for the example, so the three chips stay put while the page is open
  const [now] = useState(() => Date.now());
  const target = resolutionMins * 60_000;
  const examples = [
    { key: "on-track", start: now - target * 0.2 },
    { key: "due-soon", start: now - target * (1 - DUE_SOON_SHARE / 2) },
    { key: "breached", start: now - target - 25 * 60_000 },
  ];

  return (
    <SectionCard title="Warnings" description={`Shown on every queue, using the ${priority} resolution target as the example`}>
      <div className="flex flex-col gap-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-foreground">
          Show <span className="font-medium">due soon</span> when less than
          <Badge variant="outline" className="h-6 px-2 text-sm tabular-nums">
            {DUE_SOON_SHARE * 100}%
          </Badge>
          of the target is left
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {examples.map((e, i) => (
            <span key={e.key} className="flex items-center gap-2">
              {i > 0 && <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />}
              <SlaChip start={e.start} due={e.start + target} />
            </span>
          ))}
        </div>
        <p className="flex items-start gap-2 text-xs text-pretty text-muted-foreground">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          Changes apply to new tickets and to priority changes from now on. Existing due times are not rewritten. The 25%
          threshold is the same for every priority.
        </p>
      </div>
    </SectionCard>
  );
}

interface ExampleCardProps {
  priority: TicketPriority;
  onPriorityChange: (p: TicketPriority) => void;
  firstMins: number | null;
  resolutionMins: number | null;
  loading: boolean;
}

/** What a target means in practice: the page 5 ticket, created Tue 10 Nov at 08:14 */
function ExampleCard({ priority, onPriorityChange, firstMins, resolutionMins, loading }: ExampleCardProps) {
  const at = (mins: number) => {
    const ms = EXAMPLE_CREATED + mins * 60_000;
    return formatSast(ms, "day") === formatSast(EXAMPLE_CREATED, "day") ? formatSast(ms, "time") : formatSast(ms);
  };
  return (
    <Card className="gap-4 border border-primary/15 bg-secondary/60 p-6 shadow-none ring-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-secondary-foreground">Example</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Example priority"
          value={priority}
          onValueChange={(next) => next && onPriorityChange(next as TicketPriority)}
          className="bg-background"
        >
          {TICKET_PRIORITIES.map((p) => (
            <ToggleGroupItem key={p} value={p} className="px-2.5 text-xs data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground">
              {p}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading the targets…</p>
      ) : firstMins === null || resolutionMins === null ? (
        <p className="text-sm text-muted-foreground">Fix the {priority} targets to see the example.</p>
      ) : (
        <p className="text-sm text-pretty text-secondary-foreground">
          A <span className="font-semibold">{priority}</span> ticket created {formatSast(EXAMPLE_CREATED, "day")} at{" "}
          <span className="font-semibold tabular-nums">{formatSast(EXAMPLE_CREATED, "time")}</span> must get a first reply by{" "}
          <span className="font-semibold tabular-nums">{at(firstMins)}</span> and be resolved by{" "}
          <span className="font-semibold tabular-nums">{at(resolutionMins)}</span>.
        </p>
      )}
      {!loading && firstMins !== null && resolutionMins !== null && (
        <p className="text-xs text-secondary-foreground/75">
          {formatMinutes(firstMins)} to respond · {formatMinutes(resolutionMins)} to resolve · calendar hours, around the clock
        </p>
      )}
    </Card>
  );
}

/** Stretch S11 (Sprint 2): shown so admins know it's coming; nothing here is editable yet */
function BusinessHoursCard() {
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Business hours" action={<ComingBadge feature="S11" />}>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p className="text-pretty">
            Mon–Fri, 08:00–17:00 SAST. Clocks stop overnight and on weekends.{" "}
            <span className="text-foreground">For now, clocks run on calendar hours, 24/7.</span>
          </p>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground/80">SA public holidays skipped</span>
            <div className="flex flex-wrap gap-1.5">
              {SA_HOLIDAYS.map((h) => (
                <Badge key={h} variant="outline" className="font-normal text-muted-foreground">
                  {h}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
      <SectionCard>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="sla-pause" className="text-sm font-medium">
                Pause while Waiting on employee
              </Label>
              <ComingBadge feature="S11" />
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Agents aren&apos;t penalised while the requester is quiet. Until then the clock keeps running.
            </p>
          </div>
          <Switch id="sla-pause" disabled checked={false} aria-describedby="sla-pause-note" />
        </div>
        <span id="sla-pause-note" className="sr-only">
          Not available yet
        </span>
      </SectionCard>
    </div>
  );
}
