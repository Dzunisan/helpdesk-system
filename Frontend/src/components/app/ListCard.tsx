import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Rounded list/table surfaces (briefing p.32 "Lists & tables", reference page: My requests).
 *
 * One `grid` string is shared by the header row, every data row and the loading rows,
 * so columns line up exactly. Write it with a breakpoint prefix; below that breakpoint
 * rows stack as cards and the header row hides:
 *
 *   const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_11rem_13rem_7rem_1rem] md:items-center md:gap-6";
 *
 *   <ListCard>
 *     <ListHeaderRow grid={GRID}><span>Request</span><span>Status</span>...</ListHeaderRow>
 *     {loading ? <LoadingRows grid={GRID} columns={["title", "badge", "avatar", "meta", "icon"]} />
 *       : <ListBody>{items.map((t) => <ListRow key={t.id} grid={GRID} to={`/x/${t.id}`}>...</ListRow>)}</ListBody>}
 *   </ListCard>
 */

/** The rounded, bordered container every list and table sits in */
export function ListCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-background", className)}>{children}</div>
  );
}

/** Column headings. Hidden on phones (rows stack there); uses the same `grid` as the rows. */
export function ListHeaderRow({ grid, className, children }: { grid: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "hidden border-b border-border bg-muted/40 px-6 py-3 text-xs font-medium text-muted-foreground",
        grid,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The <ul> around ListRows: hairline dividers between rows */
export function ListBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ul role="list" className={cn("divide-y divide-border", className)}>
      {children}
    </ul>
  );
}

const ROW_BASE = "flex flex-col gap-3 px-6 py-5";
const ROW_INTERACTIVE =
  "group transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const ROW_SELECTED = "bg-accent shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent";

interface ListRowProps {
  /** Same grid string as the ListHeaderRow */
  grid: string;
  /** Makes the whole row a <Link>. Leave out when the row holds its own buttons (use ListRowLink instead). */
  to?: string;
  /** Link state, passed to react-router */
  state?: unknown;
  /** Highlighted row (current ticket in a three-pane list): accent tint + primary left edge */
  selected?: boolean;
  /** Accessible name for the whole-row link, if the visible text is not enough */
  "aria-label"?: string;
  className?: string;
  children: ReactNode;
}

/**
 * One data row (an <li>). With `to`, the entire row is a link with hover and focus styles.
 * Without `to` it is a plain row; put a <ListRowLink> on the title to make the row clickable
 * while keeping buttons inside it usable (give those buttons `relative z-10`).
 */
export function ListRow({ grid, to, state, selected, className, children, ...aria }: ListRowProps) {
  if (to) {
    return (
      <li>
        <Link
          to={to}
          state={state}
          aria-current={selected ? "page" : undefined}
          aria-label={aria["aria-label"]}
          className={cn(ROW_BASE, ROW_INTERACTIVE, selected && ROW_SELECTED, grid, className)}
        >
          {children}
        </Link>
      </li>
    );
  }
  return (
    <li
      className={cn(
        ROW_BASE,
        "relative transition-colors has-[a[data-row-link]:hover]:bg-muted/50 has-[a[data-row-link]:focus-visible]:bg-muted/50",
        selected && ROW_SELECTED,
        grid,
        className,
      )}
    >
      {children}
    </li>
  );
}

/**
 * The title link inside a ListRow that has its own buttons: it stretches over the
 * whole row (so the row is clickable) while buttons with `relative z-10` stay on top.
 */
export function ListRowLink({ to, state, className, children }: { to: string; state?: unknown; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      state={state}
      data-row-link=""
      className={cn(
        "outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Skeleton cell shapes:
 * title = ref line + title line, text = one line, badge = pill, avatar = circle + name,
 * person = 32px circle + name and email lines,
 * meta = short muted line, button = small button, icon = chevron, blank = nothing
 */
export type SkeletonColumn = "title" | "text" | "badge" | "avatar" | "person" | "meta" | "button" | "icon" | "blank";

/** A touch stronger than the default Skeleton so placeholders read on white cards */
const SK = "bg-foreground/[0.07]";

const SHOW_AT = { sm: "hidden sm:block", md: "hidden md:block", lg: "hidden lg:block", xl: "hidden xl:block" } as const;
const TITLE_WIDTHS = ["w-2/3", "w-1/2", "w-3/5", "w-2/5"];

function SkeletonCell({ kind, row }: { kind: SkeletonColumn; row: number }) {
  switch (kind) {
    case "title":
      return (
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className={cn(SK, "h-3 w-28")} />
          <Skeleton className={cn(SK, "h-4", TITLE_WIDTHS[row % TITLE_WIDTHS.length])} />
        </div>
      );
    case "text":
      return <Skeleton className={cn(SK, "h-4 w-28")} />;
    case "badge":
      return <Skeleton className={cn(SK, "h-5 w-20 rounded-full")} />;
    case "avatar":
      return (
        <div className="flex items-center gap-2.5">
          <Skeleton className={cn(SK, "size-6 shrink-0 rounded-full")} />
          <Skeleton className={cn(SK, "h-4 w-24")} />
        </div>
      );
    case "person":
      return (
        <div className="flex items-center gap-2.5">
          <Skeleton className={cn(SK, "size-8 shrink-0 rounded-full")} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn(SK, "h-3.5 w-32 max-w-full")} />
            <Skeleton className={cn(SK, "h-3 w-44 max-w-full")} />
          </div>
        </div>
      );
    case "meta":
      return <Skeleton className={cn(SK, "h-3.5 w-16")} />;
    case "button":
      return <Skeleton className={cn(SK, "h-8 w-16")} />;
    case "icon":
      return <Skeleton className={cn(SK, "size-4")} />;
    default:
      return <span />;
  }
}

interface LoadingRowsProps {
  /** Same grid string as the header row and the data rows */
  grid: string;
  /** One shape per column, in order */
  columns: SkeletonColumn[];
  /** How many placeholder rows (default 3) */
  rows?: number;
  /** The breakpoint in your grid string; columns after the first two only appear from here (default md) */
  breakpoint?: keyof typeof SHOW_AT;
}

/** Skeleton rows shaped like the real rows, for the loading state of a ListCard */
export function LoadingRows({ grid, columns, rows = 3, breakpoint = "md" }: LoadingRowsProps) {
  return (
    <ul role="list" aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, row) => (
        <li key={row} className={cn(ROW_BASE, grid)}>
          {columns.map((kind, index) => (
            <div key={index} className={cn("min-w-0", index > 1 && SHOW_AT[breakpoint])}>
              <SkeletonCell kind={kind} row={row} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** The quiet line under a list: "Showing 5 of 12 requests" */
export function ListCaption({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-xs text-muted-foreground tabular-nums", className)}>{children}</p>;
}
