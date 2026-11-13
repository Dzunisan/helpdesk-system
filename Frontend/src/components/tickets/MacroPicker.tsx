import { useEffect, useState, type ReactNode } from "react";
import { CornerDownLeft, Lock, Zap } from "lucide-react";
import { listMacros } from "@/services/macros";
import { toApiError, type ApiError } from "@/services/apiClient";
import type { Macro } from "@/types/api";
import { formatTicketRef } from "@/lib/format";
import { cn } from "@/lib/utils";
import ErrorState from "@/components/app/ErrorState";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { macroEffect, matchMacro, previewOf, type PreviewContext } from "./macroText";

interface PickerTicket {
  ticket_id: number;
  title: string;
  requester_name: string | null;
  department_name: string | null;
}

interface MacroPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Macros button */
  trigger: ReactNode;
  ticket: PickerTicket;
  agentName: string | null;
  /** The macro being inserted (GET /render running): its row shows a spinner */
  inserting: number | null;
  onPick: (macro: Macro) => void;
}

/**
 * S7 macro picker (briefing p.16, p.49): the Macros button (or "/" in an empty composer) opens a
 * searchable Command list of the department's active macros, most used first, each saying what it
 * does to the status, with a preview of the highlighted one. Picking one fills the composer.
 */
export default function MacroPicker({ open, onOpenChange, trigger, ticket, agentName, inserting, onPick }: MacroPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={8} className="w-[26rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0">
        {/* Mounted per open, so the list is fresh every time (the lead may have added one) */}
        <MacroList ticket={ticket} agentName={agentName} inserting={inserting} onPick={onPick} />
      </PopoverContent>
    </Popover>
  );
}

type ListState = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; macros: Macro[] };

function MacroList({ ticket, agentName, inserting, onPick }: Omit<MacroPickerProps, "open" | "onOpenChange" | "trigger">) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [highlighted, setHighlighted] = useState("");

  useEffect(() => {
    let live = true;
    listMacros()
      .then((macros) => live && setState({ status: "ready", macros }))
      .catch((err) => live && setState({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const macros = state.status === "ready" ? state.macros : null;
  const current = macros?.find((m) => String(m.id) === highlighted) ?? macros?.[0] ?? null;
  const ctx: PreviewContext = {
    ref: formatTicketRef(ticket.ticket_id),
    title: ticket.title,
    requesterName: ticket.requester_name,
    agentName,
  };
  const department = ticket.department_name ?? "your department";

  return (
    <Command value={highlighted} onValueChange={setHighlighted} filter={matchMacro} className="rounded-none! p-0" loop>
      <div className="p-1.5 pb-0">
        <CommandInput placeholder="Search macros…" aria-label="Search macros" autoFocus />
      </div>
      <CommandList className="max-h-64 p-1">
        {state.status === "error" ? (
          <div className="p-2">
            <ErrorState
              stacked
              title="Couldn't load macros"
              description={state.error.status === 0 ? undefined : state.error.message}
              onRetry={retry}
            />
          </div>
        ) : !macros ? (
          <div aria-busy="true" aria-label="Loading macros" className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-2 py-2">
                <Skeleton className="size-4 rounded-sm bg-foreground/[0.07]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className={cn("h-3.5 bg-foreground/[0.07]", i % 2 ? "w-1/2" : "w-2/3")} />
                  <Skeleton className="h-3 w-28 bg-foreground/[0.07]" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty className="px-4 py-6 text-sm text-muted-foreground">
              {macros.length === 0
                ? `No macros in ${department} yet. Your lead adds them under Macros.`
                : "No macro matches that. Try another word."}
            </CommandEmpty>
            {macros.length > 0 && (
              <CommandGroup heading={`${ticket.department_name ?? "Department"} macros`}>
                {macros.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={String(m.id)}
                    keywords={[m.title, m.body]}
                    onSelect={() => onPick(m)}
                    disabled={inserting !== null}
                    className="items-start gap-2.5 px-2 py-2"
                  >
                    {inserting === m.id ? (
                      <Spinner className="mt-0.5 text-primary" />
                    ) : (
                      <Zap className="mt-0.5 text-muted-foreground group-data-selected/command-item:text-primary!" aria-hidden />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium group-data-selected/command-item:text-primary">{m.title}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {m.is_internal && <Lock className="size-3! text-warning" aria-hidden />}
                        {macroEffect(m.set_status, m.is_internal)}
                      </span>
                    </span>
                    <CommandShortcut className="hidden self-center group-data-selected/command-item:flex">
                      <CornerDownLeft className="size-3.5" aria-label="Enter to insert" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
      {current && (
        <>
          <Separator />
          <div className="flex flex-col gap-1 bg-muted/40 px-4 py-3" aria-live="polite">
            <span className="text-xs font-medium text-foreground">Preview</span>
            <p className="line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{previewOf(current.body, ctx)}</p>
          </div>
        </>
      )}
    </Command>
  );
}
