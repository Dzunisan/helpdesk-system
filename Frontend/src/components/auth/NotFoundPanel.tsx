import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HeadsetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface NotFoundPanelProps {
  /** Small indigo line above the title, e.g. "404" */
  eyebrow?: ReactNode;
  /** Or an icon tile above the title instead (e.g. SearchX for "Ticket not found") */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons: one primary way home, then outline extras */
  actions?: ReactNode;
  className?: string;
}

/**
 * "We couldn't find that page" / "Ticket not found" (briefing p.69): centred, calm, with a way home.
 * A ticket you may not see uses the same words as one that doesn't exist.
 */
export default function NotFoundPanel({ eyebrow, icon: Icon, title, description, actions, className }: NotFoundPanelProps) {
  return (
    <Empty className={cn("gap-6 p-0", className)}>
      <EmptyHeader className="max-w-md gap-2">
        {Icon && (
          <EmptyMedia
            variant="icon"
            className="mb-2 size-12 rounded-xl bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5"
          >
            <Icon aria-hidden />
          </EmptyMedia>
        )}
        {eyebrow && (
          <p className="font-mono text-xs font-semibold tracking-wider text-primary tabular-nums">{eyebrow}</p>
        )}
        <EmptyTitle className="text-xl font-semibold tracking-tight text-balance">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-pretty">{description}</EmptyDescription>}
      </EmptyHeader>
      {actions && <EmptyContent className="flex-row flex-wrap justify-center gap-2">{actions}</EmptyContent>}
    </Empty>
  );
}

/** Outline "Contact IT" button that shows the IT desk number (same number as the sign-in page) */
export function ContactItButton({ size = "default" }: { size?: "default" | "lg" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size}>
          <HeadsetIcon data-icon="inline-start" />
          Contact IT
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>IT desk</PopoverTitle>
          <PopoverDescription>
            Call <span className="font-medium text-foreground tabular-nums">011 555 0142</span>.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
