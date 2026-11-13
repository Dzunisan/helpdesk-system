// S3 SLA policies (briefing p.12, p.64). Contract: docs/api-sprint-1.md "S3".
import { Request, Response } from "express";
import { pool } from "../config/database";
import { notImplemented } from "../utils/notImplemented";

/** GET /api/sla-policies -> { policies } ordered Urgent, High, Normal, Low. Everyone signed in. */
export const listSlaPolicies = async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT priority, first_response_mins, resolution_mins, updated_at
       FROM sla_policy
       ORDER BY priority`
    );
    return res.status(200).json({ policies: rows });
  } catch (error) {
    console.error("SLA policy error:", error);
    return res.status(500).json({ message: "An unexpected error occurred" });
  }
};

/** PUT /api/sla-policies/:priority -> System Admin edits targets; affects new tickets and later priority changes only */
export const updateSlaPolicy = notImplemented("S3 PUT /api/sla-policies/:priority");
