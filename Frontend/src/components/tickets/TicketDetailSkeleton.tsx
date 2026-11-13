import { Skeleton } from "@/components/ui/skeleton";
import { TICKET_GRID } from "./layout";

/** Loading state shaped like the real page: header, thread cards, composer and the side panel */
export default function TicketDetailSkeleton({ staff }: { staff: boolean }) {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading ticket">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="mb-2 h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-7 w-full max-w-md" />
          <div className="mt-1 flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        {staff && <Skeleton className="h-9 w-28" />}
      </div>
      {!staff && (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-1.5 rounded-full" />
          ))}
        </div>
      )}

      <div className={TICKET_GRID}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-border p-5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2.5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border p-6">
            <Skeleton className="h-5 w-24" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
