import { Request, Response } from "express";
import * as departmentService from "../services/departmentService";

const STATUSES = ["active", "inactive"];

const handleError = (res: Response, error: any) => {
  if (error.code === "23505" && error.constraint === "department_lead_unique") {
    return res.status(409).json({ message: "That person already leads another department." });
  }
  if (error.code === "23505") {
    return res.status(409).json({ message: "A department with that name already exists." });
  }
  if (error.code === "23503") {
    return res.status(400).json({ message: "The selected lead does not exist." });
  }
  // users_department_required (S1): Employees, Agents and Leads always belong to a department
  if (error.code === "23514" && error.constraint === "users_department_required") {
    return res.status(409).json({
      message: "Employees, agents and leads must belong to a department. Move them to another department instead.",
    });
  }
  console.error("Department error:", error);
  // The database error text stays in the server log; the browser only gets a generic message
  return res.status(500).json({ message: "An unexpected error occurred" });
};

/** The lead id from the body: `lead_id` (contract) or `leadId` (older screens) */
const leadIdFrom = (body: any) => (body?.lead_id !== undefined ? body.lead_id : body?.leadId);

/**
 * Checks a lead named on department create/update against the S1 rule (an active Department Lead
 * who leads no other department). Sends 404/409 itself and returns false when it did.
 * departmentId is null for a department that doesn't exist yet.
 */
const checkLead = async (res: Response, leadId: string, departmentId: number | null): Promise<boolean> => {
  const user = await departmentService.getUserForLead(leadId);
  if (!user) {
    res.status(404).json({ message: "User not found." });
    return false;
  }
  const problem = departmentService.leadProblem(user, departmentId ?? -1);
  if (problem) {
    res.status(409).json({ message: problem });
    return false;
  }
  return true;
};

export const create = async (req: Request, res: Response) => {
  const { name, description, status } = req.body;
  const leadId = leadIdFrom(req.body);
  const errors: string[] = [];

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    errors.push("Department name is required.");

  } else if (name.trim().length > 255) {
    errors.push("Department name must be 255 characters or fewer.");
  }

  if (status !== undefined && !STATUSES.includes(status)) {
    errors.push("Status must be 'active' or 'inactive'.");
  }

  if (leadId !== undefined && leadId !== null && leadId !== "" && !/^\d+$/.test(String(leadId))) {
    errors.push("Lead ID must be a valid user ID.");
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

   try {
    const lead = leadId !== undefined && leadId !== null && String(leadId).trim() !== "" ? String(leadId).trim() : null;
    if (lead && !(await checkLead(res, lead, null))) return;
    const created = await departmentService.createDepartment(name.trim(), description || null, status || "active", lead);
    const department = await departmentService.getDepartmentById(created.department_id);
    return res.status(201).json({ department });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
  const status = (req.query.status as string) || null;
  const search = (req.query.search as string)?.trim() || null;

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ message: "Status must be 'active' or 'inactive'." });
  }

  try {
    const { departments, total } = await departmentService.getDepartments(page, limit, status, search);
    return res.status(200).json({
      departments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getOne = async (req: Request, res: Response) => { //FInd by id 
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  try {
    const department = await departmentService.getDepartmentById(Number(idParam));
    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }
    return res.status(200).json({ department });
  } catch (error) {
    return handleError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  const { name, description, status } = req.body;
  const leadId = leadIdFrom(req.body);
  const errors: string[] = [];

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      errors.push("Department name cannot be empty.");
    } else if (name.trim().length > 255) {
      errors.push("Department name must be 255 characters or fewer.");
    }
  }

  if (status !== undefined && !STATUSES.includes(status)) {
    errors.push("Status must be 'active' or 'inactive'.");
  }

  if (leadId !== undefined && leadId !== null && leadId !== "" && !/^\d+$/.test(String(leadId))) {
    errors.push("Lead ID must be a valid user ID.");
  }

  if (name === undefined && description === undefined && status === undefined && leadId === undefined) {
    errors.push("Provide a name, description, status, or leadId to update.");
  }
  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    const lead = leadId !== undefined ? (leadId && String(leadId).trim() !== "" ? String(leadId).trim() : null) : undefined;
    if (lead) {
      if (!(await departmentService.getDepartmentById(Number(idParam)))) {
        return res.status(404).json({ message: "Department not found." });
      }
      if (!(await checkLead(res, lead, Number(idParam)))) return;
    }
    const updated = await departmentService.updateDepartment(
      Number(idParam),
      name !== undefined ? name.trim() : undefined,
      description !== undefined ? (description !== null ? String(description).trim() : null) : undefined,
      status !== undefined ? status : undefined,
      lead
    );
    if (!updated) {
      return res.status(404).json({ message: "Department not found." });
    }
    const department = await departmentService.getDepartmentById(Number(idParam));
    return res.status(200).json({ department });
  } catch (error) {
    return handleError(res, error);
  }
};


export const remove = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  try {
    const department = await departmentService.softDeleteDepartment(Number(idParam));
    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }
    return res.status(200).json({ message: "Department deleted.", department });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * PUT /api/departments/:id/lead { lead_id } (leadId still accepted) -> { department }
 * S1 (page 10, 62): only an active Department Lead who leads no other department (409 otherwise).
 * Also sets the lead's users.department_id to this department, in the same transaction.
 */
export const assignLead = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam) || Number(idParam) > 2147483647) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  const leadId = leadIdFrom(req.body);
  if (leadId === undefined || leadId === null || !/^\d{1,18}$/.test(String(leadId).trim())) {
    return res.status(400).json({ message: "Choose who should lead this department (lead_id)." });
  }
  const lead = String(leadId).trim();

  try {
    const existing = await departmentService.getDepartmentById(Number(idParam));
    if (!existing) {
      return res.status(404).json({ message: "Department not found." });
    }
    if (!(await checkLead(res, lead, Number(idParam)))) return;

    await departmentService.assignDepartmentLead(Number(idParam), lead);
    const department = await departmentService.getDepartmentById(Number(idParam));
    return res.status(200).json({ message: "Department lead appointed.", department });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeLead = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  try {
    const department = await departmentService.removeDepartmentLead(Number(idParam));
    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }
    return res.status(200).json({ message: "Department lead removed.", department });
  } catch (error) {
    return handleError(res, error);
  }
};

const MEMBER_ROLES = ["Employee", "Agent"];

/* System Admins can manage any department. A Department Lead can only
 manage the department whose lead_id is their own user_id. */
const canManageDepartment = (user: any, department: any) => {
  if (!user) return false;
  if (user.role === "System Admin") return true;
  return (
    user.role === "Department Lead" &&
    department.lead_id !== null &&
    String(department.lead_id) === String(user.user_id)
  );
};

export const addMembers = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }

  const { userIds } = req.body;

  if (
    !Array.isArray(userIds) ||
    userIds.length === 0 ||
    userIds.length > 100 ||
    !userIds.every((id) => /^\d+$/.test(String(id)))
  ) {
    return res
      .status(400)
      .json({ message: "userIds must be a non-empty array of valid user IDs (max 100)." });
  }

  const ids = [...new Set(userIds.map((id) => String(id)))];

  try {
    const department = await departmentService.getDepartmentById(Number(idParam));
    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }

    if (!canManageDepartment((req as any).user, department)) {
      return res
        .status(403)
        .json({ message: "You can only add members to a department you lead." });
    }

    const users = await departmentService.getUsersByIds(ids);

    const foundIds = users.map((u: any) => String(u.user_id));
    const missing = ids.filter((id) => !foundIds.includes(id));
    if (missing.length > 0) {
      return res.status(404).json({ message: "Some users were not found.", missing });
    }

    const inactive = users.filter((u: any) => u.active !== true).map((u: any) => String(u.user_id));
    if (inactive.length > 0) {
      return res.status(400).json({ message: "Some users are not active.", inactive });
    }

    const wrongRole = users
      .filter((u: any) => !MEMBER_ROLES.includes(u.role))
      .map((u: any) => String(u.user_id));
    if (wrongRole.length > 0) {
      return res
        .status(400)
        .json({ message: "Only Employees and Agents can be added as team members.", wrongRole });
    }

    const alreadyMembers = users
      .filter((u: any) => u.department_id === Number(idParam))
      .map((u: any) => String(u.user_id));
    const inOtherDepartment = users
      .filter((u: any) => u.department_id !== null && u.department_id !== Number(idParam))
      .map((u: any) => String(u.user_id));

    const toAdd = ids.filter(
      (id) => !alreadyMembers.includes(id) && !inOtherDepartment.includes(id)
    );

    if (toAdd.length === 0) {
      return res.status(409).json({
        message: "No users were added.",
        alreadyMembers,
        inOtherDepartment,
      });
    }

    const added = await departmentService.addDepartmentMembers(Number(idParam), toAdd);

    return res.status(201).json({
      message: "Team members added.",
      added,
      skipped: { alreadyMembers, inOtherDepartment },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeMember = async (req: Request, res: Response) => {
  const idParam = req.params.id as string;
  const userIdParam = req.params.userId as string;

  if (!/^\d+$/.test(idParam)) {
    return res.status(400).json({ message: "Invalid department ID." });
  }
  if (!/^\d+$/.test(userIdParam)) {
    return res.status(400).json({ message: "Invalid user ID." });
  }

  try {
    const department = await departmentService.getDepartmentById(Number(idParam));
    if (!department) {
      return res.status(404).json({ message: "Department not found." });
    }

    if (!canManageDepartment((req as any).user, department)) {
      return res
        .status(403)
        .json({ message: "You can only remove members from a department you lead." });
    }

    const member = await departmentService.removeDepartmentMember(
      Number(idParam),
      userIdParam
    );
    if (!member) {
      return res.status(404).json({ message: "User is not a member of this department." });
    }

    return res.status(200).json({ message: "Team member removed.", member });
  } catch (error) {
    return handleError(res, error);
  }
};
    

