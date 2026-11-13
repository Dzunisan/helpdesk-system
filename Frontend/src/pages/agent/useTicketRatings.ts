import { useEffect, useMemo, useState } from "react";
import { getTicketFeedback } from "@/services/feedback";
import type { Ticket, TicketFeedback } from "@/types/api";

/** A rating never changes once given (S10: a second one is 409), so found ratings are kept for the session */
const known = new Map<number, TicketFeedback>();

/**
 * The requester's rating of each Closed ticket (S10, GET /api/tickets/:id/feedback; staff of the
 * department may read it). Only Closed tickets can be rated, so the rest are skipped. One request
 * per ticket, all at once; a failed one just shows no rating.
 */
export function useTicketRatings(tickets: Ticket[]) {
  const ids = useMemo(() => tickets.filter((t) => t.ticket_status === "Closed").map((t) => t.ticket_id), [tickets]);
  // Unrated (null) or failed answers from this page's requests
  const [fetched, setFetched] = useState<Map<number, TicketFeedback | null>>(() => new Map());

  const missing = ids.filter((id) => !known.has(id) && !fetched.has(id));
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    const wanted = missingKey.split(",").map(Number);
    void Promise.allSettled(wanted.map((id) => getTicketFeedback(id))).then((results) => {
      if (!live) return;
      setFetched((prev) => {
        const next = new Map(prev);
        results.forEach((r, i) => {
          const fb = r.status === "fulfilled" ? r.value : null;
          if (fb) known.set(wanted[i], fb);
          next.set(wanted[i], fb);
        });
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  const ratings = useMemo(() => {
    const map = new Map<number, TicketFeedback | null>();
    for (const id of ids) {
      if (known.has(id)) map.set(id, known.get(id)!);
      else if (fetched.has(id)) map.set(id, fetched.get(id)!);
    }
    return map;
  }, [ids, fetched]);

  return { ratings, loading: missing.length > 0 };
}

/** CSAT (p.19): 4-5 stars / all ratings, as a whole percent; null without ratings */
export function csatOf(ratings: Iterable<TicketFeedback | null>): { pct: number | null; responses: number } {
  let responses = 0;
  let happy = 0;
  for (const fb of ratings) {
    if (!fb) continue;
    responses += 1;
    if (fb.rating >= 4) happy += 1;
  }
  return { pct: responses ? Math.round((happy / responses) * 100) : null, responses };
}
