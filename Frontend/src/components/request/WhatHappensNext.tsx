import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category } from "@/types/api";
import { formatDurationWords } from "@/lib/format";
import { cn } from "@/lib/utils";

interface WhatHappensNextProps {
  category: Category;
  /** The first-response target for the category's default priority, from the SLA policy */
  firstReplyMins?: number | null;
  className?: string;
}

/**
 * Side card on the details step (briefing p.39 "What happens next"): who approves (approval
 * categories), who picks it up and how soon, and how it ends.
 */
export default function WhatHappensNext({ category, firstReplyMins, className }: WhatHappensNextProps) {
  const team = category.department_name;
  const within = firstReplyMins ? ` First reply within ${formatDurationWords(firstReplyMins)}.` : "";
  const steps = category.needs_approval
    ? [
        {
          title: `The ${team} lead approves or declines`,
          body: "Usually within 1 working day. You'll see the reason either way.",
        },
        { title: `If approved, ${team} picks it up`, body: `It joins their queue straight away.${within}` },
        { title: "You confirm it works", body: "Then the request closes." },
      ]
    : [
        { title: `It goes straight to ${team}`, body: "You get an HD reference to quote on the phone or WhatsApp." },
        { title: "Someone picks it up", body: `An agent takes it on and replies to you here.${within}` },
        { title: "You confirm it works", body: "Then the request closes. You can say it's still broken for 5 days." },
      ];

  return (
    <Card
      className={cn(
        "gap-5 border border-primary/15 bg-primary/5 shadow-none ring-0 [--card-spacing:--spacing(6)]",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">What happens next</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && (
                <span aria-hidden className="absolute top-7 bottom-1 left-3 w-px -translate-x-1/2 bg-primary/20" />
              )}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
