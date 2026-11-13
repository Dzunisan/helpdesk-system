import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WhatHappensNextProps {
  /** The team picked in the form, so step 1 can name it */
  departmentName?: string | null;
  className?: string;
}

/** Side card for the new request form (briefing p.39 "What happens next") */
export default function WhatHappensNext({ departmentName, className }: WhatHappensNextProps) {
  const steps = [
    {
      title: departmentName ? `It goes to ${departmentName}` : "It goes to the team you pick",
      body: "Your request joins their queue straight away with an HD reference you can quote.",
    },
    {
      title: "Someone picks it up",
      body: "An agent takes it on and sets the priority. Replies and status changes are emailed to you.",
    },
    {
      title: "It gets resolved",
      body: "You can follow every step, and reply, under My requests.",
    },
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
            <li key={step.body} className="relative flex gap-3 pb-5 last:pb-0">
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

/** Compact "how to write a good request" card under What happens next */
export function RequestTips({ className }: { className?: string }) {
  const tips = [
    "Say what you were trying to do when it went wrong.",
    "Copy any error message word for word.",
    "Mention your device, office or desk if it matters.",
  ];
  return (
    <Card className={cn("gap-4 border border-border shadow-none ring-0 [--card-spacing:--spacing(6)]", className)}>
      <CardHeader className="flex items-center gap-2">
        <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-base font-semibold tracking-tight">Tips for a quicker fix</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2.5 text-sm text-muted-foreground">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              {tip}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
