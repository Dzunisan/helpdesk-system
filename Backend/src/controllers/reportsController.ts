import { Request, Response } from "express";
import * as reportService from "../services/reportService";

// GET /api/reports/admin-overview (System Admin): organisation counts, never ticket content
export const adminOverview = async (_req: Request, res: Response) => {
  try {
    const overview = await reportService.getAdminOverview();
    return res.status(200).json(overview);
  } catch (error) {
    console.error("Admin overview error:", error);
    return res.status(500).json({ message: "Could not load the admin overview." });
  }
};
