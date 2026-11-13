import { useState } from "react";
import { Star } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { ratingWord } from "./csat";

interface StarRatingProps {
  /** 0 = nothing chosen yet */
  value: number;
  onChange: (rating: number) => void;
  /** lg = the survey page (44px+ tap targets), default = a card on the request page */
  size?: "default" | "lg";
  disabled?: boolean;
  /** Show the word label ("Excellent") on the right */
  showWord?: boolean;
  className?: string;
  "aria-labelledby"?: string;
}

/**
 * Big stars as a shadcn ToggleGroup (briefing p.43 "Stars: ToggleGroup"): one tab stop, arrow keys
 * move, hover previews, and the word label says what the number means.
 */
export default function StarRating({
  value,
  onChange,
  size = "default",
  disabled,
  showWord = true,
  className,
  ...aria
}: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const lg = size === "lg";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <ToggleGroup
        type="single"
        spacing={lg ? 1 : 0}
        value={value ? String(value) : ""}
        // Clicking the chosen star again keeps it (a rating is never "unset" by accident)
        onValueChange={(next) => next && onChange(Number(next))}
        onMouseLeave={() => setHover(0)}
        disabled={disabled}
        aria-label={aria["aria-labelledby"] ? undefined : "Rating"}
        aria-labelledby={aria["aria-labelledby"]}
        className="-ml-1.5"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}: ${ratingWord(n).toLowerCase()}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(0)}
            className={cn(
              "rounded-lg p-0 hover:bg-muted data-[state=on]:bg-transparent",
              lg ? "size-12 sm:size-14" : "size-11",
            )}
          >
            <Star
              aria-hidden
              className={cn(
                "transition-transform",
                lg ? "size-9! sm:size-10!" : "size-7!",
                n <= shown ? "fill-rating text-rating" : "fill-transparent text-muted-foreground/40",
                n === hover && "scale-110",
              )}
            />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {showWord && (
        <span className={cn("min-w-20 font-semibold text-foreground", lg ? "text-lg" : "text-sm")} aria-live="polite">
          {shown ? ratingWord(shown) : <span className="text-sm font-normal text-muted-foreground">Tap a star</span>}
        </span>
      )}
    </div>
  );
}

/** Read-only stars for an existing rating: "You rated this 5 stars" */
export function StarsShown({ value, size = "default", className }: { value: number; size?: "default" | "lg"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            size === "lg" ? "size-7" : "size-4",
            n <= value ? "fill-rating text-rating" : "fill-muted text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
