// S9 System Admin tools (briefing p.18): "Sent messages" (the outbox) and "Run jobs now".
// OWNER: the notifications feature. Contract: docs/api-sprint-2.md "S9".
import { Request, Response } from "express";
import { runJobs } from "../services/jobs";
import { notImplemented } from "../utils/notImplemented";
import { sendError } from "../utils/httpError";

/** POST /api/admin/jobs/run (System Admin) -> { result: JobsResult } */
export const runJobsNow = async (_req: Request, res: Response) => {
  try {
    const result = await runJobs();
    return res.status(200).json({ message: "Jobs ran.", result });
  } catch (error) {
    return sendError(res, error, "Jobs error");
  }
};

/** GET /api/admin/outbox?status=&channel=&page=&limit= (System Admin) */
export const listOutbox = notImplemented("S9 GET /api/admin/outbox");
