// S5 Guided requests with category routing (briefing p.14). Contract: docs/api-sprint-1.md "S5".
import { Request, Response } from "express";
import { pool } from "../config/database";
import type { Category } from "../types/category.types";
import { notImplemented } from "../utils/notImplemented";

const CATEGORY_SELECT = `
  SELECT c.category_id, c.category_name, c.department_id, d.department_name, c.kind, c.icon, c.description,
         c.default_priority, c.needs_approval, c.fields, c.active, c.created_at, c.updated_at
  FROM category c
  JOIN department d ON d.department_id = c.department_id`;

/**
 * GET /api/categories -> { categories, departments: [{ department_id, department_name, categories }] }
 * Everyone signed in gets the active categories of active departments (the new request form).
 * System Admin may add ?include_inactive=true for the Categories & routing page.
 */
export const listCategories = async (req: Request, res: Response) => {
  const includeInactive = req.user?.role === "System Admin" && req.query.include_inactive === "true";
  try {
    const { rows } = await pool.query<Category>(
      `${CATEGORY_SELECT}
       ${includeInactive ? "" : "WHERE c.active AND d.status = 'active'"}
       ORDER BY d.department_name, c.kind, c.category_name`
    );
    const departments: { department_id: number; department_name: string; categories: Category[] }[] = [];
    for (const category of rows) {
      let group = departments.find((g) => g.department_id === category.department_id);
      if (!group) {
        group = { department_id: category.department_id, department_name: category.department_name, categories: [] };
        departments.push(group);
      }
      group.categories.push(category);
    }
    return res.status(200).json({ categories: rows, departments });
  } catch (error) {
    console.error("Category error:", error);
    return res.status(500).json({ message: "An unexpected error occurred" });
  }
};

/** POST /api/categories -> System Admin creates a category */
export const createCategory = notImplemented("S5 POST /api/categories");

/** PATCH /api/categories/:id -> System Admin edits or deactivates (never deletes) */
export const updateCategory = notImplemented("S5 PATCH /api/categories/:id");
