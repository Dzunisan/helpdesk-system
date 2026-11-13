import { Request, Response } from "express";

/**
 * Placeholder handler for a Sprint 1 endpoint whose route is wired but not built yet.
 * The contract is in docs/api-sprint-1.md; replace the handler, keep the route.
 */
export const notImplemented = (feature: string) => (_req: Request, res: Response) =>
  res.status(501).json({ message: `Not implemented yet (${feature}). See docs/api-sprint-1.md.` });
