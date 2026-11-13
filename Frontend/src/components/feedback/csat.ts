/** Shared CSAT words and links (S10, briefing p.19, p.43) */

/** The word beside the stars (p.43 "Excellent"); index = rating */
export const RATING_WORDS = ["", "Poor", "Fair", "Okay", "Good", "Excellent"] as const;

export const ratingWord = (rating: number): string => RATING_WORDS[rating] ?? "";

/** The survey page for one request; `rating` pre-selects the stars tapped on the request page */
export const surveyPath = (ticketId: number, rating?: number) =>
  `/employee/tickets/${ticketId}/feedback${rating ? `?rating=${rating}` : ""}`;
