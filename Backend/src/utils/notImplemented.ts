import { Request, Response } from "express";

/**
 * Placeholder handler for an endpoint whose route is wired but not built yet.
 * The contract is in docs/api-sprint-1.md (Sprint 1) or docs/api-sprint-2.md (Sprint 2);
 * replace the handler, keep the route.
 */
export const notImplemented = (feature: string, doc = "docs/api-sprint-2.md") => (_req: Request, res: Response) =>
  res.status(501).json({ message: `Not implemented yet (${feature}). See ${doc}.` });
