import { Fragment, useRef, useState, type FormEvent } from "react";
import { Ban, Braces, RotateCcw } from "lucide-react";
import { MACRO_PLACEHOLDERS, type CreateMacroRequest, type Macro, type TicketStatus } from "@/types/api";
import { firstNameOf, formatSast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/apiClient";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { MACRO_STATUS_OPTIONS, REPLY_ONLY } from "./macroText";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/** Splits a body into text and {{placeholder}} parts */
const PLACEHOLDER_RE = /(\{\{[a-z_.]+\}\})/gi;

/** The reply with each placeholder as a chip, the way agents will see it filled (p.58) */
export function MacroPreview({ body, className }: { body: string; className?: string }) {
  if (!body.trim()) return <p className={cn("text-sm text-muted-foreground", className)}>The reply appears here as you type.</p>;
  return (
    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]", className)}>
      {body.split(PLACEHOLDER_RE).map((part, i) =>
        /^\{\{[a-z_.]+\}\}$/i.test(part) ? (
          <Badge key={i} variant="secondary" className="mx-0.5 h-5 rounded-md px-1.5 font-mono text-[11px] align-baseline">
            {part.slice(2, -2)}
          </Badge>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

interface MacroEditorProps {
  /** null = a new macro */
  macro: Macro | null;
  departmentName: string | null;
  /** Create or save; throws ApiError (409 duplicate title, 400 empty) */
  onSave: (body: CreateMacroRequest) => Promise<void>;
  /** Deactivate (false) or bring back (true) */
  onSetActive?: (active: boolean) => Promise<void>;
  onCancelNew?: () => void;
}

/**
 * The right pane of the macros manager (briefing p.16, p.58): title, reply with placeholder
 * chips, "Then set status", public reply or internal note, usage line, Deactivate and Save.
 * Key it by macro id so switching macros starts from that macro's saved values.
 */
export default function MacroEditor({ macro, departmentName, onSave, onSetActive, onCancelNew }: MacroEditorProps) {
  const [title, setTitle] = useState(macro?.title ?? "");
  const [body, setBody] = useState(macro?.body ?? "");
  const [status, setStatus] = useState<string>(macro?.set_status ?? REPLY_ONLY);
  const [internal, setInternal] = useState(macro?.is_internal ?? false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isNew = macro === null;
  const inactive = macro !== null && !macro.active;
  const dirty =
    isNew ||
    title !== macro.title ||
    body !== macro.body ||
    (status === REPLY_ONLY ? null : status) !== macro.set_status ||
    internal !== macro.is_internal;
  const titleMissing = title.trim() === "";
  const bodyMissing = body.trim() === "";

  const insertPlaceholder = (placeholder: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + placeholder + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFormError(null);
    setTitleError(null);
    if (titleMissing || bodyMissing) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        body,
        set_status: status === REPLY_ONLY ? null : (status as TicketStatus),
        is_internal: internal,
      });
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) setTitleError(err.message || "Your department already has a macro with that title.");
      else setFormError(err instanceof Error ? err.message : "Couldn't save the macro.");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (active: boolean) => {
    if (!onSetActive) return;
    setToggling(true);
    try {
      await onSetActive(active);
    } finally {
      setToggling(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {inactive && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
          Deactivated: agents can&apos;t insert this macro. Its use count is kept.
        </div>
      )}

      <FieldGroup className="gap-6">
        <Field data-invalid={(touched && titleMissing) || !!titleError || undefined}>
          <FieldLabel htmlFor="macro-title">Title</FieldLabel>
          <Input
            id="macro-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            maxLength={120}
            placeholder="VPN: switch to TCP profile"
            aria-invalid={(touched && titleMissing) || !!titleError || undefined}
            className="h-10 sm:h-9"
          />
          {titleError ? (
            <FieldError>{titleError}</FieldError>
          ) : touched && titleMissing ? (
            <FieldError>Give the macro a short title agents will search for.</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={(touched && bodyMissing) || undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor="macro-body">Reply</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Insert a placeholder">
              <Braces className="size-3.5 text-muted-foreground" aria-hidden />
              {MACRO_PLACEHOLDERS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="font-mono text-[11px] text-secondary-foreground"
                  onClick={() => insertPlaceholder(p)}
                  aria-label={`Insert ${p}`}
                >
                  {p.slice(2, -2)}
                </Button>
              ))}
            </div>
          </div>
          <Textarea
            id="macro-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            maxLength={5000}
            className="min-h-48 font-normal leading-relaxed"
            placeholder={"Hi {{requester.first_name}},\n\n..."}
            aria-invalid={(touched && bodyMissing) || undefined}
          />
          {touched && bodyMissing ? (
            <FieldError>Write the reply agents will send.</FieldError>
          ) : (
            <FieldDescription className="text-xs">
              Placeholders are filled in for each ticket when an agent inserts the macro. They can still edit before sending.
            </FieldDescription>
          )}
        </Field>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Preview</span>
          <MacroPreview body={body} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="macro-status">Then set status</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="macro-status" className="h-10 w-full sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MACRO_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="text-xs">Only applied when the move is allowed for that agent.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="macro-visibility">Send as</FieldLabel>
            <Select value={internal ? "internal" : "public"} onValueChange={(v) => setInternal(v === "internal")}>
              <SelectTrigger id="macro-visibility" className="h-10 w-full sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public reply</SelectItem>
                <SelectItem value="internal">Internal note</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription className="text-xs">Available to {departmentName ?? "your department's"} agents only.</FieldDescription>
          </Field>
        </div>
      </FieldGroup>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Separator />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {isNew
            ? "New macro: agents can use it as soon as you save."
            : [
                `Used ${macro.use_count === 1 ? "once" : `${macro.use_count} times`}`,
                `last edited${macro.updated_by_name ? ` by ${firstNameOf(macro.updated_by_name)}` : ""}, ${formatSast(macro.updated_at, "day")}`,
              ].join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isNew ? (
            onCancelNew && (
              <Button type="button" variant="outline" onClick={onCancelNew} disabled={saving} className="h-10 sm:h-9">
                Cancel
              </Button>
            )
          ) : inactive ? (
            <Button type="button" variant="outline" onClick={() => void setActive(true)} disabled={toggling} className="h-10 sm:h-9">
              {toggling ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
              Reactivate
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)} disabled={toggling} className="h-10 sm:h-9">
              {toggling && <Spinner data-icon="inline-start" />}
              Deactivate
            </Button>
          )}
          <Button type="submit" disabled={saving || !dirty} className="h-10 min-w-28 sm:h-9">
            {saving && <Spinner data-icon="inline-start" />}
            {isNew ? "Create macro" : "Save macro"}
          </Button>
        </div>
      </div>

      {macro && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Deactivate "${macro.title}"?`}
          description="Agents won't see it in the Macros picker any more. Nothing is deleted: its use count stays and you can bring it back."
          confirmLabel="Deactivate"
          destructive
          icon={Ban}
          onConfirm={() => void setActive(false)}
        />
      )}
    </form>
  );
}
