// S1 Department workspaces & privacy (briefing p.10, p.61). Contract: docs/api-sprint-1.md "S1".
// System Admin manages Employees, Agents and Department Leads; Platform Admin manages System Admins.
// There is no hard delete: PATCH /api/users/:id/active deactivates, and requireAuth answers 401 to a
// deactivated user's very next request.
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import * as userServices from "../services/userService";
import { DEPARTMENT_ROLES, ALL_ROLES } from "../services/userService";
import { sendTempPasswordEmail } from "../utils/emailService";

/** The roles a signed-in admin may see, create and manage */
const getAllowedTargetRoles = (adminRole: string): string[] => {
    if (adminRole === "Platform Admin") return ["System Admin"];
    if (adminRole === "System Admin") return ["Department Lead", "Agent", "Employee"];
    return [];
};

const ROLE_LIMIT_MESSAGE: Record<string, string> = {
    "Platform Admin": "Platform Admins can only manage System Admins.",
    "System Admin": "System Admins can only manage Employees, Agents and Department Leads.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INT_ID = 2147483647;
const isUserId = (val: unknown): boolean => /^\d{1,18}$/.test(String(val ?? "").trim());
const paramId = (req: Request): string => {
    const raw = req.params.id;
    return String(Array.isArray(raw) ? raw[0] : raw ?? "").trim();
};

/** null/"" -> null, a positive int -> number, anything else -> NaN (a 400) */
const parseDepartmentId = (value: unknown): number | null => {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text) || Number(text) > MAX_INT_ID) return NaN;
    return Number(text);
};

const cleanName = (value: unknown, label: string, errors: string[]): string | undefined => {
    if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${label} is required.`);
        return undefined;
    }
    if (value.trim().length > 100) {
        errors.push(`${label} must be 100 characters or fewer.`);
        return undefined;
    }
    return value.trim();
};

const cleanEmail = (value: unknown, errors: string[]): string | undefined => {
    if (typeof value !== "string" || value.trim() === "") {
        errors.push("Email is required.");
        return undefined;
    }
    const email = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 255) {
        errors.push("Enter a valid email address.");
        return undefined;
    }
    return email;
};

const validationFailed = (res: Response, errors: string[]) =>
    res.status(400).json({ message: errors.length === 1 ? errors[0] : "Validation failed", errors });

/**
 * A temporary password that already meets the password rules (8+ characters, upper and lower case,
 * a number), without look-alike characters, e.g. "Kp7wXq4mRt".
 */
const makeTemporaryPassword = (): string => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const all = upper + lower + digits;
    const pick = (set: string) => set[crypto.randomInt(set.length)];
    const chars = [pick(upper), pick(lower), pick(digits)];
    while (chars.length < 12) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
};

/**
 * Sends the welcome email with the temporary password. Never fails the request: the account exists
 * either way. Returns false when email isn't configured (local development and the free demo) or the
 * send failed; createUser then hands the temporary password to the admin once, labelled as a
 * simulated email, so the new person can still sign in. The password never goes to the log.
 */
const sendWelcomeEmail = async (email: string, tempPassword: string): Promise<boolean> => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        console.warn(`[users] Email is not configured: the welcome email for ${email} is simulated in the response.`);
        return false;
    }
    try {
        await sendTempPasswordEmail(email, tempPassword);
        return true;
    } catch (error) {
        console.error(`[users] Welcome email to ${email} failed:`, error);
        return false;
    }
};

/**
 * The department rule (page 10): Employees, Agents and Leads need a department that exists;
 * admins have none. Returns an error message, or null when the combination is fine.
 */
const departmentProblem = async (role: string, departmentId: number | null): Promise<string | null> => {
    if (DEPARTMENT_ROLES.includes(role)) {
        if (departmentId === null) return "Choose a department.";
        const department = await userServices.departmentExists(departmentId);
        if (!department) return "That department doesn't exist.";
        return null;
    }
    if (departmentId !== null) return `A ${role} doesn't belong to a department.`;
    return null;
};

/** POST /api/users -> 201 { user, welcome_email_sent } */
export const createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authUser = req.user!;
        const allowedRoles = getAllowedTargetRoles(authUser.role);
        if (allowedRoles.length === 0) {
            return res.status(403).json({ message: "You do not have permission to create users." });
        }

        const { role } = req.body;
        const errors: string[] = [];
        const name = cleanName(req.body.name, "Name", errors);
        const surname = cleanName(req.body.surname, "Surname", errors);
        const email = cleanEmail(req.body.email, errors);
        if (typeof role !== "string" || !ALL_ROLES.includes(role)) {
            errors.push(`Role must be one of: ${allowedRoles.join(", ")}.`);
        }
        const departmentId = parseDepartmentId(req.body.department_id);
        if (Number.isNaN(departmentId)) errors.push("Department ID must be a valid integer.");
        if (errors.length > 0) return validationFailed(res, errors);

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ message: ROLE_LIMIT_MESSAGE[authUser.role] });
        }

        const problem = await departmentProblem(role, departmentId);
        if (problem) return validationFailed(res, [problem]);

        if (await userServices.emailTaken(email!)) {
            return res.status(409).json({ message: "A user with this email already exists." });
        }

        const tempPassword = makeTemporaryPassword();
        // Page 61: "Ask them to set a new password at first sign-in" is on unless the admin unticks it
        const mustChange = req.body.must_change_password !== false;
        const created = await userServices.createUser({
            user_id: "",
            name: name!,
            surname: surname!,
            email: email!,
            password: tempPassword,
            role,
            active: true,
            department_id: departmentId,
            must_change_password: mustChange,
        });

        const welcomeEmailSent = await sendWelcomeEmail(created.email, tempPassword);
        const user = await userServices.getUserView(String(created.user_id));
        // No real email went out: show the admin the simulated welcome email once (DoD, page 28)
        const simulated = welcomeEmailSent
            ? {}
            : { simulated_welcome_email: { to: created.email, temporary_password: tempPassword } };
        return res.status(201).json({ user, welcome_email_sent: welcomeEmailSent, ...simulated });
    } catch (error: any) {
        if (error?.code === "23505") {
            return res.status(409).json({ message: "A user with this email already exists." });
        }
        next(error);
    }
};

/** Loads the target of an admin action. Sends 400/404/403 itself and returns null when it did. */
const loadManagedUser = async (req: Request, res: Response) => {
    const id = paramId(req);
    if (!isUserId(id)) {
        res.status(400).json({ message: "Invalid user ID." });
        return null;
    }
    const allowedRoles = getAllowedTargetRoles(req.user!.role);
    if (allowedRoles.length === 0) {
        res.status(403).json({ message: "You do not have permission to manage users." });
        return null;
    }
    const target = await userServices.findById(id);
    if (!target) {
        res.status(404).json({ message: "User not found." });
        return null;
    }
    if (!allowedRoles.includes(target.role)) {
        res.status(403).json({ message: ROLE_LIMIT_MESSAGE[req.user!.role] });
        return null;
    }
    return { id, target, allowedRoles };
};

/**
 * PATCH /api/users/:id -> { user }. Admins edit name, surname, email, role and department.
 * A lead who leads a department can't be demoted or moved until another lead is appointed (409).
 */
export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const loaded = await loadManagedUser(req, res);
        if (!loaded) return;
        const { id, target, allowedRoles } = loaded;

        const body = req.body ?? {};
        const errors: string[] = [];
        const update: Record<string, unknown> = {};
        if (body.name !== undefined) update.name = cleanName(body.name, "Name", errors);
        if (body.surname !== undefined) update.surname = cleanName(body.surname, "Surname", errors);
        if (body.email !== undefined) update.email = cleanEmail(body.email, errors);
        if (body.role !== undefined) {
            if (typeof body.role !== "string" || !ALL_ROLES.includes(body.role)) {
                errors.push(`Role must be one of: ${allowedRoles.join(", ")}.`);
            } else {
                update.role = body.role;
            }
        }
        let departmentId: number | null | undefined;
        if (body.department_id !== undefined) {
            departmentId = parseDepartmentId(body.department_id);
            if (Number.isNaN(departmentId)) errors.push("Department ID must be a valid integer.");
        }
        if (errors.length > 0) return validationFailed(res, errors);
        if (
            update.name === undefined && update.surname === undefined && update.email === undefined &&
            update.role === undefined && departmentId === undefined
        ) {
            return validationFailed(res, ["Send at least one of name, surname, email, role or department_id."]);
        }

        const nextRole = (update.role as string | undefined) ?? target.role;
        if (!allowedRoles.includes(nextRole)) {
            return res.status(403).json({ message: ROLE_LIMIT_MESSAGE[req.user!.role] });
        }
        // Admins never keep a department; when the role changes to an admin role the department goes
        let nextDepartment = departmentId !== undefined ? departmentId : (target.department_id ?? null);
        if (!DEPARTMENT_ROLES.includes(nextRole) && departmentId === undefined) nextDepartment = null;

        const problem = await departmentProblem(nextRole, nextDepartment);
        if (problem) return validationFailed(res, [problem]);

        const led = await userServices.ledDepartmentOf(id);
        if (led && nextRole !== "Department Lead") {
            return res.status(409).json({
                message: `${target.name} leads ${led.department_name}. Appoint another lead there first.`,
            });
        }
        if (led && nextDepartment !== led.department_id) {
            return res.status(409).json({
                message: `${target.name} leads ${led.department_name}, so their department stays ${led.department_name}. Appoint another lead there first.`,
            });
        }

        if (update.email !== undefined && (await userServices.emailTaken(update.email as string, id))) {
            return res.status(409).json({ message: "A user with this email already exists." });
        }

        await userServices.updateUser(id, {
            name: update.name as string | undefined,
            surname: update.surname as string | undefined,
            email: update.email as string | undefined,
            role: update.role as string | undefined,
            department_id: nextDepartment,
        });
        const user = await userServices.getUserView(id);
        return res.status(200).json({ user });
    } catch (error: any) {
        if (error?.code === "23505") {
            return res.status(409).json({ message: "A user with this email already exists." });
        }
        next(error);
    }
};

/** PATCH /api/users/:id/active { active } -> { user }. Deactivate or reactivate; there is no delete. */
export const setUserActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.body?.active !== "boolean") {
            return validationFailed(res, ["active must be true or false."]);
        }
        const active: boolean = req.body.active;
        if (!active && paramId(req) === String(req.user!.user_id)) {
            return validationFailed(res, ["You can't deactivate your own account."]);
        }
        const loaded = await loadManagedUser(req, res);
        if (!loaded) return;

        await userServices.updateUser(loaded.id, { active });
        const user = await userServices.getUserView(loaded.id);
        return res.status(200).json({ user });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/users -> { users }; GET /api/users/:id -> { user }.
 * Query: role, department_id, active (true/false), search (name or email).
 */
export const fetchUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authUser = req.user!;
        const allowedRoles = getAllowedTargetRoles(authUser.role);
        if (allowedRoles.length === 0) {
            return res.status(403).json({ message: "You do not have permission to view users." });
        }

        const rawId = paramId(req) || String(req.query.id ?? "").trim();
        if (rawId) {
            if (!isUserId(rawId)) return res.status(400).json({ message: "Invalid user ID." });
            const user = await userServices.getUserView(rawId);
            if (!user || !allowedRoles.includes(user.role)) {
                return res.status(404).json({ message: "User not found." });
            }
            return res.status(200).json({ user });
        }

        const errors: string[] = [];
        const role = typeof req.query.role === "string" && req.query.role.trim() !== "" ? req.query.role.trim() : null;
        if (role && !ALL_ROLES.includes(role)) errors.push(`Role must be one of: ${allowedRoles.join(", ")}.`);
        const departmentId = parseDepartmentId(req.query.department_id);
        if (Number.isNaN(departmentId)) errors.push("department_id must be a valid integer.");
        let active: boolean | null = null;
        if (req.query.active !== undefined && req.query.active !== "") {
            if (req.query.active === "true") active = true;
            else if (req.query.active === "false") active = false;
            else errors.push("active must be true or false.");
        }
        if (errors.length > 0) return validationFailed(res, errors);

        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        // A role outside the caller's reach simply matches nobody
        const users = await userServices.listUsers({
            roles: role ? allowedRoles.filter((r) => r === role) : allowedRoles,
            department_id: departmentId,
            active,
            search: search || null,
        });
        return res.status(200).json({ users });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/users/update[/:id] and PUT /api/users/:id. Your own id: the profile page edits your name
 * and surname, nothing else. Your email is managed by your admin, and a new password only goes
 * through POST /api/auth/change-password, which checks the current one (400 here otherwise).
 * Someone else's id: the admin rules of PATCH /:id, plus { active } handled like PATCH /:id/active.
 */
export const updateUserLegacy = async (req: Request, res: Response, next: NextFunction) => {
    const authUser = req.user!;
    const id = paramId(req) || String(authUser.user_id);
    if (id !== String(authUser.user_id)) {
        const { active, ...rest } = req.body ?? {};
        const hasEdits = ["name", "surname", "email", "role", "department_id"].some((k) => rest[k] !== undefined);
        if (typeof active === "boolean" && !hasEdits) {
            req.body = { active };
            return setUserActive(req, res, next);
        }
        req.body = rest;
        return updateUser(req, res, next);
    }

    try {
        const { name, surname, email, password } = req.body ?? {};
        if (password !== undefined && password !== null && String(password) !== "") {
            return validationFailed(res, ["Change your password with POST /api/auth/change-password (it asks for your current one)."]);
        }
        if (email !== undefined && email !== null && String(email).trim() !== "") {
            return validationFailed(res, ["Your email is managed by your admin."]);
        }
        const errors: string[] = [];
        const update: Record<string, string | undefined> = {};
        if (name !== undefined) update.name = cleanName(name, "Name", errors);
        if (surname !== undefined) update.surname = cleanName(surname, "Surname", errors);
        if (errors.length > 0) return validationFailed(res, errors);
        if (Object.keys(update).length === 0) {
            return validationFailed(res, ["Send your name or surname."]);
        }
        await userServices.updateUser(id, update);
        const user = await userServices.getUserView(id);
        return res.status(200).json({ message: "User updated successfully", user });
    } catch (error) {
        next(error);
    }
};
