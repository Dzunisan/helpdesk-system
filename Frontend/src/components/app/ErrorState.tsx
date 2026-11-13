import type { ReactNode } from "react";
import { CircleAlert, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** What failed, in plain words: "Couldn't load your requests" */
  title: ReactNode;
  /** One sentence; defaults to "Check your connection and try again." */
  description?: ReactNode;
  /** Shows a "Try again" button that calls this */
  onRetry?: () => void;
  /** Disable the button and spin its icon while the retry runs */
  retrying?: boolean;
  /** Button text (default "Try again") */
  retryLabel?: string;
  /** Always a column (button under the text), for narrow side cards */
  stacked?: boolean;
  className?: string;
}

/**
 * The error state for any data view (briefing p.32 "Feedback", p.47): a destructive Alert
 * with "Try again" on the right (under the text on phones). Put it where the list or card
 * would be; don't also toast the same error.
 * @example <ErrorState title="Couldn't load the queue" onRetry={refetch} />
 */
export default function ErrorState({
  title,
  description = "Check your connection and try again.",
  onRetry,
  retrying,
  retryLabel = "Try again",
  stacked,
  className,
}: ErrorStateProps) {
  return (
    <Alert
      variant="destructive"
      className={cn(
        "flex flex-col gap-4 rounded-xl border-destructive/25 bg-destructive/5 px-5 py-4",
        !stacked && "sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <AlertTitle className="font-semibold">{title}</AlertTitle>
          <AlertDescription className="text-destructive/80">{description}</AlertDescription>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
          className={cn(
            "ml-8 shrink-0 self-start border-destructive/30 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive",
            !stacked && "sm:ml-0 sm:self-auto",
          )}
        >
          <RotateCw data-icon="inline-start" className={cn(retrying && "animate-spin")} />
          {retryLabel}
        </Button>
      )}
    </Alert>
  );
}
