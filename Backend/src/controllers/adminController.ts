// S9 System Admin tools (briefing p.18): "Sent messages" (the outbox) and "Run jobs now".
// Contract: docs/api-sprint-2.md "S9". Both routes are System Admin only (routes/adminRoutes.ts).
import { Request, Response } from "express";
import { runJobs } from "../services/jobs";
import {
  listOutboxMessages,
  OUTBOX_CHANNELS,
  OUTBOX_STATUSES,
  type OutboxChannel,
  type OutboxStatus,
} from "../services/outbox";
import { HttpError, sendError } from "../utils/httpError";

/** POST /api/admin/jobs/run (System Admin) -> { result: JobsResult } */
export const runJobsNow = async (_req: Request, res: Response) => {
  try {
    const result = await runJobs();
    return res.status(200).json({ message: "Jobs ran.", result });
  } catch (error) {
    return sendError(res, error, "Jobs error");
  }
};

const one = (value: unknown): string => String(Array.isArray(value) ? value[0] : (value ?? "")).trim();

const wholeNumber = (value: unknown, name: string, fallback: number, max: number): number => {
  const text = one(value);
  if (text === "") return fallback;
  if (!/^\d{1,6}$/.test(text) || Number(text) < 1) throw new HttpError(400, `${name} must be a whole number from 1.`);
  return Math.min(Number(text), max);
};

/** GET /api/admin/outbox?status=&channel=&date=&page=&limit= (System Admin) */
export const listOutbox = async (req: Request, res: Response) => {
  try {
    const status = one(req.query.status).toUpperCase();
    if (status && !OUTBOX_STATUSES.includes(status as OutboxStatus)) {
      throw new HttpError(400, `status must be one of ${OUTBOX_STATUSES.join(", ")}.`);
    }
    const channel = one(req.query.channel).toLowerCase();
    if (channel && !OUTBOX_CHANNELS.includes(channel as OutboxChannel)) {
      throw new HttpError(400, `channel must be one of ${OUTBOX_CHANNELS.join(", ")}.`);
    }
    const date = one(req.query.date);
    const isRealDay = (d: string) => {
      const parsed = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
    };
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDay(date))) {
      throw new HttpError(400, "date must look like 2026-11-10.");
    }
    const result = await listOutboxMessages({
      status: (status || undefined) as OutboxStatus | undefined,
      channel: (channel || undefined) as OutboxChannel | undefined,
      date: date || undefined,
      page: wholeNumber(req.query.page, "page", 1, 100_000),
      limit: wholeNumber(req.query.limit, "limit", 25, 100),
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "Outbox error");
  }
};
