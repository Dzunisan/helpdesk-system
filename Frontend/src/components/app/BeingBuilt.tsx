import type { ReactNode } from "react";
import { Hammer, type LucideIcon } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import EmptyState from "@/components/app/EmptyState";
import { ListCard } from "@/components/app/ListCard";

interface BeingBuiltProps {
  /** The page title, sentence case: "Categories & routing" */
  title: ReactNode;
  /** The page's one-line context, as the finished page will show it */
  description?: ReactNode;
  /** What the finished page will do, one sentence */
  plan: ReactNode;
  /** Briefing feature id, e.g. "S7" */
  feature: string;
  /** Which sprint delivers it (default 2) */
  sprint?: 1 | 2;
  back?: { to: string; label: string };
  icon?: LucideIcon;
}

/**
 * Placeholder for a screen whose route exists but whose page is still being built.
 * Replace the whole page component when the feature lands; keep the route.
 */
export default function BeingBuilt({ title, description, plan, feature, sprint = 2, back, icon = Hammer }: BeingBuiltProps) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} description={description} back={back} />
      <ListCard>
        <EmptyState
          icon={icon}
          title="Being built"
          description={
            <>
              {plan} Coming in Sprint {sprint} ({feature}).
            </>
          }
        />
      </ListCard>
    </div>
  );
}
