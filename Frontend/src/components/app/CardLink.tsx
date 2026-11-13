import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The quiet "View all →" link in a SectionCard's top-right `action` slot.
 * 40px tall on phones (tap target), 32px from sm.
 * @example <SectionCard title="My tickets" action={<CardLink to="/agent/queue/my-open">View all</CardLink>} />
 */
export default function CardLink({ to, children, className }: { to: string; children: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "-mr-2 inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-medium whitespace-nowrap text-primary transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:h-8",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
