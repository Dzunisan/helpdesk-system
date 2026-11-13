// S5 Guided requests with category routing (briefing p.14, p.63). Contract: docs/api-sprint-1.md "S5".
import { Request, Response } from "express";
import * as categoryService from "../services/categoryService";

const handleError = (res: Response, error: any) => {
  if (error?.code === "23505") {
    return res.status(409).json({ message: "A category with that name already exists in this department." });
  }
  console.error("Category error:", error);
  // The database error text stays in the server log; the browser only gets a generic message
  return res.status(500).json({ message: "An unexpected error occurred" });
};

const validationFailed = (res: Response, errors: string[]) =>
  res.status(400).json({ message: errors.length === 1 ? errors[0] : "Validation failed", errors });

/**
 * GET /api/categories -> { categories, departments: [{ department_id, department_name, categories }] }
 * Everyone signed in gets the active categories of active departments (the new request form).
 * System Admin may add ?include_inactive=true for the Categories & routing page.
 */
export const listCategories = async (req: Request, res: Response) => {
  const includeInactive = req.user?.role === "System Admin" && req.query.include_inactive === "true";
  try {
    return res.status(200).json(await categoryService.listCategories(includeInactive));
  } catch (error) {
    return handleError(res, error);
  }
};

/** POST /api/categories -> 201 { category }. System Admin (requireRole in categoryRoutes). */
export const createCategory = async (req: Request, res: Response) => {
  const errors: string[] = [];
  const input = categoryService.validateCategoryBody(req.body ?? {}, false, errors) as categoryService.CategoryInput;
  if (errors.length > 0) return validationFailed(res, errors);

  try {
    if (!(await categoryService.departmentExists(input.department_id))) {
      return res.status(404).json({ message: "Department not found." });
    }
    if (await categoryService.nameTaken(input.department_id, input.category_name)) {
      return res.status(409).json({ message: `${input.category_name} already exists in this department.` });
    }
    const category = await categoryService.createCategory(input);
    return res.status(201).json({ category });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * PATCH /api/categories/:id -> { category }. System Admin. Any subset of the create body.
 * Deactivate with { active: false }: there is no delete, old tickets keep their category.
 */
export const updateCategory = async (req: Request, res: Response) => {
  const idParam = String(req.params.id ?? "");
  if (!categoryService.isIntId(idParam)) {
    return res.status(400).json({ message: "Invalid category ID." });
  }
  const id = Number(idParam);

  const errors: string[] = [];
  const changes = categoryService.validateCategoryBody(req.body ?? {}, true, errors);
  if (errors.length > 0) return validationFailed(res, errors);
  if (Object.keys(changes).length === 0) {
    return validationFailed(res, ["Send at least one field to change."]);
  }

  try {
    const current = await categoryService.getCategory(id);
    if (!current) {
      return res.status(404).json({ message: "Category not found." });
    }
    if (changes.department_id !== undefined && !(await categoryService.departmentExists(changes.department_id))) {
      return res.status(404).json({ message: "Department not found." });
    }
    const departmentId = changes.department_id ?? current.department_id;
    const name = changes.category_name ?? current.category_name;
    if (
      (changes.department_id !== undefined || changes.category_name !== undefined) &&
      (await categoryService.nameTaken(departmentId, name, id))
    ) {
      return res.status(409).json({ message: `${name} already exists in this department.` });
    }
    const category = await categoryService.updateCategory(id, changes);
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }
    return res.status(200).json({ category });
  } catch (error) {
    return handleError(res, error);
  }
};
