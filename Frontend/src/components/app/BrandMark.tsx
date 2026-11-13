import { InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Logo mark + "Helpdesk / Mzansi Freight", shared by the app shell and the public pages */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <InboxIcon className="size-4" />
      </span>
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-semibold">Helpdesk</span>
        <span className="truncate text-xs text-muted-foreground">Mzansi Freight</span>
      </span>
    </span>
  );
}
