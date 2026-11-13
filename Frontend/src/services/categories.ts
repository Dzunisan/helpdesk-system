/** Sprint 1 category endpoints (docs/api-sprint-1.md: S5). Every function throws ApiError. */
import { api, call } from "./apiClient";
import type {
  Category,
  CategoryListResponse,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "@/types/api";

/**
 * GET /api/categories: active categories of active departments (the new request form).
 * `includeInactive` is honoured for System Admin only (Categories & routing page).
 */
export const listCategories = (options: { includeInactive?: boolean } = {}) =>
  call(
    () =>
      api.get<CategoryListResponse>("/categories", {
        params: options.includeInactive ? { include_inactive: true } : undefined,
      }),
    "Couldn't load categories.",
  );

/** POST /api/categories: System Admin */
export const createCategory = async (body: CreateCategoryRequest): Promise<Category> =>
  (await call(() => api.post<CategoryResponse>("/categories", body), "Couldn't create the category.")).category;

/** PATCH /api/categories/:id: System Admin; deactivate with { active: false } */
export const updateCategory = async (id: number, body: UpdateCategoryRequest): Promise<Category> =>
  (await call(() => api.patch<CategoryResponse>(`/categories/${id}`, body), "Couldn't save the category.")).category;
