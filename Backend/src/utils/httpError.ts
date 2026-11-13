import { Response } from "express";

/**
 * An error with the HTTP status the API should answer. Services throw it (inside withTransaction it
 * also rolls the change back); controllers turn it into `{ message, errors? }` with sendError().
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: string[]
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Answers an HttpError with its status; anything else is logged and becomes a generic 500 */
export const sendError = (res: Response, error: unknown, label = "Ticket error") => {
  if (error instanceof HttpError) {
    return res
      .status(error.status)
      .json(error.errors ? { message: error.message, errors: error.errors } : { message: error.message });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ message: "An unexpected error occurred" });
};

const MAX_INT_ID = 2147483647;

/** An int id from a route param (ticket, comment, ...): digits only, within Postgres' integer range */
export const parseIntId = (value: unknown, what = "ticket"): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text) || Number(text) > MAX_INT_ID) {
    throw new HttpError(400, `Invalid ${what} ID. Must be an integer.`);
  }
  return Number(text);
};
