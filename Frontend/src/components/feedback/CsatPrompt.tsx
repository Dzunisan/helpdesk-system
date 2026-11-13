import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Ticket, TicketFeedback } from "@/types/api";
import { firstNameOf, formatSast } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SectionCard from "@/components/app/SectionCard";
import StarRating, { StarsShown } from "./StarRating";
import { ratingWord, surveyPath } from "./csat";

/**
 * "How did Thabo do?" on a closed request (briefing p.41 "a link to the CSAT survey once closed",
 * p.45 phone: the stars right after "Yes, it's fixed"). Tapping a star opens the survey with it chosen.
 */
export function CsatPrompt({ ticket }: { ticket: Pick<Ticket, "ticket_id" | "assignee_name" | "department_name"> }) {
  const navigate = useNavigate();
  const who = ticket.assignee_name ? firstNameOf(ticket.assignee_name) : (ticket.department_name ?? "the team");

  return (
    <Card className="gap-4 border border-primary/20 bg-primary/5 shadow-none ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">How did {who} do?</CardTitle>
        <CardDescription>One quick rating helps the team get better. You can rate each request once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <StarRating value={0} onChange={(rating) => navigate(surveyPath(ticket.ticket_id, rating))} showWord={false} />
        <Button asChild variant="outline" className="h-11 w-full bg-background sm:h-9 sm:w-auto">
          <Link to={surveyPath(ticket.ticket_id)}>
            Open the survey
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** The rating already given: stars, word, tags and comment (p.43 "Already rated?") */
export function RatingCard({ feedback, title = "Your rating" }: { feedback: TicketFeedback; title?: string }) {
  return (
    <SectionCard title={title}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <StarsShown value={feedback.rating} />
          <span className="text-sm font-medium">{ratingWord(feedback.rating) || `${feedback.rating}/5`}</span>
        </div>
        {feedback.tags && feedback.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="What went well">
            {feedback.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        {feedback.comment && (
          <blockquote className="border-l-2 border-border pl-3 text-sm wrap-break-word whitespace-pre-wrap text-foreground">
            {feedback.comment}
          </blockquote>
        )}
        <p className="text-xs text-muted-foreground">Sent {formatSast(feedback.created_at)}</p>
      </div>
    </SectionCard>
  );
}
