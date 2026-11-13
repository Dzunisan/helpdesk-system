// S5 Guided requests with category routing (briefing p.14, p.63). The category decides the
// department, default priority, approval and extra form fields of every new ticket.
// Categories are never deleted: deactivating one hides it from the form, old tickets keep it.
import { pool } from "../config/database";
import type { Category, CategoryField, CategoryKind } from "../types/category.types";
import { VALID_PRIORITIES, type TicketPriority } from "../types/ticket.types";

const CATEGORY_SELECT = `
  SELECT c.category_id, c.category_name, c.department_id, d.department_name, c.kind, c.icon, c.description,
         c.default_priority, c.needs_approval, c.fields, c.active, c.created_at, c.updated_at
  FROM category c
  JOIN department d ON d.department_id = c.department_id`;

export interface CategoryGroup {
  department_id: number;
  department_name: string;
  categories: Category[];
}

/**
 * Categories sorted by department, kind, name. Without includeInactive: only active categories of
 * active departments (what the new request form offers).
 */
export const listCategories = async (includeInactive = false): Promise<{ categories: Category[]; departments: CategoryGroup[] }> => {
  const { rows } = await pool.query<Category>(
    `${CATEGORY_SELECT}
     ${includeInactive ? "" : "WHERE c.active AND d.status = 'active'"}
     ORDER BY d.department_name, c.kind, c.category_name`
  );
  const departments: CategoryGroup[] = [];
  for (const category of rows) {
    let group = departments.find((g) => g.department_id === category.department_id);
    if (!group) {
      group = { department_id: category.department_id, department_name: category.department_name, categories: [] };
      departments.push(group);
    }
    group.categories.push(category);
  }
  return { categories: rows, departments };
};

export const getCategory = async (categoryId: number): Promise<Category | null> => {
  const { rows } = await pool.query<Category>(`${CATEGORY_SELECT} WHERE c.category_id = $1`, [categoryId]);
  return rows[0] ?? null;
};

/** The category as POST /api/tickets needs it, with its department's status */
export const getCategoryForTicket = async (
  categoryId: number
): Promise<(Category & { department_status: string }) | null> => {
  const { rows } = await pool.query(
    `SELECT c.category_id, c.category_name, c.department_id, d.department_name, d.status AS department_status,
            c.kind, c.icon, c.description, c.default_priority, c.needs_approval, c.fields, c.active,
            c.created_at, c.updated_at
     FROM category c
     JOIN department d ON d.department_id = c.department_id
     WHERE c.category_id = $1`,
    [categoryId]
  );
  return rows[0] ?? null;
};

export const departmentExists = async (departmentId: number): Promise<boolean> => {
  const { rowCount } = await pool.query("SELECT 1 FROM department WHERE department_id = $1", [departmentId]);
  return (rowCount ?? 0) > 0;
};

/** Is the name used by another category of the same department? Case-insensitive. */
export const nameTaken = async (departmentId: number, name: string, exceptCategoryId?: number): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM category
     WHERE department_id = $1 AND lower(category_name) = lower($2) AND ($3::int IS NULL OR category_id <> $3::int)`,
    [departmentId, name, exceptCategoryId ?? null]
  );
  return (rowCount ?? 0) > 0;
};

export interface CategoryInput {
  category_name: string;
  department_id: number;
  kind: CategoryKind;
  icon: string;
  description: string | null;
  default_priority: TicketPriority;
  needs_approval: boolean;
  fields: CategoryField[];
  active: boolean;
}

export const createCategory = async (input: CategoryInput): Promise<Category> => {
  const { rows } = await pool.query(
    `INSERT INTO category (category_name, department_id, kind, icon, description, default_priority, needs_approval, fields, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING category_id`,
    [
      input.category_name,
      input.department_id,
      input.kind,
      input.icon,
      input.description,
      input.default_priority,
      input.needs_approval,
      JSON.stringify(input.fields),
      input.active,
    ]
  );
  return (await getCategory(rows[0].category_id))!;
};

export const updateCategory = async (categoryId: number, changes: Partial<CategoryInput>): Promise<Category | null> => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    values.push(column === "fields" ? JSON.stringify(value) : value);
    sets.push(`${column} = $${values.length}${column === "fields" ? "::jsonb" : ""}`);
  }
  if (sets.length === 0) return getCategory(categoryId);
  values.push(categoryId);
  const { rowCount } = await pool.query(
    `UPDATE category SET ${sets.join(", ")}, updated_at = now() WHERE category_id = $${values.length}`,
    values
  );
  if (!rowCount) return null;
  return getCategory(categoryId);
};

// ---------------------------------------------------------------------------------------------
// Validation shared by POST and PATCH /api/categories
// ---------------------------------------------------------------------------------------------

export const CATEGORY_KINDS: CategoryKind[] = ["fix", "request"];
export const FIELD_TYPES: CategoryField["type"][] = ["text", "number", "long_text", "date"];
const FIELD_KEY = /^[a-z][a-z0-9_]{0,49}$/;
const ICON_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_FIELDS = 20;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates the extra fields builder (page 63). Returns clean fields (unknown keys dropped). */
export const validateFields = (raw: unknown, errors: string[]): CategoryField[] => {
  if (!Array.isArray(raw)) {
    errors.push("fields must be a list.");
    return [];
  }
  if (raw.length > MAX_FIELDS) errors.push(`A category can have at most ${MAX_FIELDS} extra fields.`);
  const seen = new Set<string>();
  const fields: CategoryField[] = [];
  raw.forEach((item, index) => {
    const n = index + 1;
    if (!isPlainObject(item)) {
      errors.push(`Field ${n} must be an object.`);
      return;
    }
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!FIELD_KEY.test(key)) {
      errors.push(`Field ${n}: key must be snake_case (lower case letters, numbers and _), e.g. "software_name".`);
    } else if (seen.has(key)) {
      errors.push(`Field ${n}: the key "${key}" is used twice.`);
    }
    seen.add(key);
    if (label === "" || label.length > 100) errors.push(`Field ${n}: label is required (100 characters or fewer).`);
    if (!FIELD_TYPES.includes(item.type as CategoryField["type"])) {
      errors.push(`Field ${n}: type must be one of ${FIELD_TYPES.join(", ")}.`);
    }
    if (item.required !== undefined && typeof item.required !== "boolean") {
      errors.push(`Field ${n}: required must be true or false.`);
    }
    const field: CategoryField = {
      key,
      label,
      type: item.type as CategoryField["type"],
      required: item.required === true,
    };
    for (const [prop, max] of [["help", 200], ["unit", 20]] as const) {
      const value = item[prop];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "string" || value.trim().length > max) {
        errors.push(`Field ${n}: ${prop} must be text of ${max} characters or fewer.`);
      } else {
        field[prop] = value.trim();
      }
    }
    fields.push(field);
  });
  return fields;
};

const MAX_INT_ID = 2147483647;
export const isIntId = (val: unknown): boolean => {
  const text = String(val ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0 && Number(text) <= MAX_INT_ID;
};

/**
 * Validates a create (partial = false: name, department and kind required; the rest defaults) or a
 * PATCH body (partial = true: only what was sent). Returns the clean values.
 */
export const validateCategoryBody = (
  body: Record<string, unknown>,
  partial: boolean,
  errors: string[]
): Partial<CategoryInput> => {
  const out: Partial<CategoryInput> = {};
  const has = (key: string) => body[key] !== undefined;

  if (has("category_name") || !partial) {
    const name = typeof body.category_name === "string" ? body.category_name.trim() : "";
    if (name === "") errors.push("Category name is required.");
    else if (name.length > 100) errors.push("Category name must be 100 characters or fewer.");
    else out.category_name = name;
  }
  if (has("department_id") || !partial) {
    if (!isIntId(body.department_id)) errors.push("Choose the department this category routes to.");
    else out.department_id = Number(body.department_id);
  }
  if (has("kind") || !partial) {
    if (!CATEGORY_KINDS.includes(body.kind as CategoryKind)) {
      errors.push(`Kind must be "fix" (Something is broken) or "request" (I need something).`);
    } else out.kind = body.kind as CategoryKind;
  }
  if (has("icon")) {
    const icon = typeof body.icon === "string" ? body.icon.trim() : "";
    if (!ICON_NAME.test(icon) || icon.length > 64) errors.push(`Icon must be a lucide icon name in kebab case, e.g. "wifi".`);
    else out.icon = icon;
  } else if (!partial) out.icon = "circle-help";
  if (has("description")) {
    if (body.description === null || body.description === "") out.description = null;
    else if (typeof body.description !== "string" || body.description.trim().length > 500) {
      errors.push("Description must be text of 500 characters or fewer.");
    } else out.description = body.description.trim() || null;
  } else if (!partial) out.description = null;
  if (has("default_priority")) {
    if (!VALID_PRIORITIES.includes(body.default_priority as TicketPriority)) {
      errors.push(`Default priority must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    } else out.default_priority = body.default_priority as TicketPriority;
  } else if (!partial) out.default_priority = "Normal";
  if (has("needs_approval")) {
    if (typeof body.needs_approval !== "boolean") errors.push("needs_approval must be true or false.");
    else out.needs_approval = body.needs_approval;
  } else if (!partial) out.needs_approval = false;
  if (has("fields")) out.fields = validateFields(body.fields, errors);
  else if (!partial) out.fields = [];
  if (has("active")) {
    if (typeof body.active !== "boolean") errors.push("active must be true or false.");
    else out.active = body.active;
  } else if (!partial) out.active = true;

  return out;
};
