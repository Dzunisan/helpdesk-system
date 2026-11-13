// S3 SLA policies (briefing p.12, p.64). Contract: docs/api-sprint-1.md "S3".
import { Request, Response } from "express";
import { pool } from "../config/database";
import { VALID_PRIORITIES } from "../types/ticket.types";
import { HttpError, sendError } from "../utils/httpError";

const POLICY_COLUMNS = "priority, first_response_mins, resolution_mins, updated_at";

/** GET /api/sla-policies -> { policies } ordered Urgent, High, Normal, Low. Everyone signed in. */
export const listSlaPolicies = async (_req: Request, res: Response) => {
  try {
    // ORDER BY the enum: Urgent, High, Normal, Low
    const { rows } = await pool.query(`SELECT ${POLICY_COLUMNS} FROM sla_policy ORDER BY priority`);
    return res.status(200).json({ policies: rows });
  } catch (error) {
    return sendError(res, error, "SLA policy error");
  }
};

const MAX_MINUTES = 60 * 24 * 365; // one year: anything longer is a typo

const minutes = (value: unknown, label: string, errors: string[]): number | null => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    errors.push(`${label} must be a whole number of minutes above 0.`);
    return null;
  }
  if (n > MAX_MINUTES) {
    errors.push(`${label} can be at most ${MAX_MINUTES} minutes (one year).`);
    return null;
  }
  return n;
};

/**
 * PUT /api/sla-policies/:priority { first_response_mins, resolution_mins } -> System Admin (the
 * route checks the role). Affects new tickets and later priority changes only: due times already
 * stored on tickets are never rewritten.
 */
export const updateSlaPolicy = async (req: Request, res: Response) => {
  try {
    const raw = String(req.params.priority ?? "").trim();
    const priority = VALID_PRIORITIES.find((p) => p.toLowerCase() === raw.toLowerCase());
    if (!priority) throw new HttpError(404, `There is no ${raw || "such"} priority.`);

    const errors: string[] = [];
    const first = minutes(req.body?.first_response_mins, "First response", errors);
    const resolution = minutes(req.body?.resolution_mins, "Resolution", errors);
    if (first !== null && resolution !== null && resolution < first) {
      errors.push("Resolution can't be sooner than the first response.");
    }
    if (errors.length) throw new HttpError(400, errors[0], errors);

    const { rows } = await pool.query(
      `UPDATE sla_policy
       SET first_response_mins = $1, resolution_mins = $2, updated_at = now(), updated_by = $3
       WHERE priority = $4
       RETURNING ${POLICY_COLUMNS}`,
      [first, resolution, req.user!.user_id, priority]
    );
    if (!rows[0]) throw new HttpError(404, `There is no ${priority} policy.`);
    return res.status(200).json({ policy: rows[0] });
  } catch (error) {
    return sendError(res, error, "SLA policy error");
  }
};
