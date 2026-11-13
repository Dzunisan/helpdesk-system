import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import * as userServices from "../services/userService";
import { JWT_SECRET } from "../config/env";
import type { User } from "../types/user.types";

const COOKIE_NAME = "session";

/** The session token from the cookie (or an Authorization: Bearer header) */
const tokenOf = (req: Request): string | null => {
    const cookie = req.cookies?.[COOKIE_NAME];
    if (cookie) return cookie;
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) return header.split(" ")[1] ?? null;
    return null;
};

/**
 * The signed-in user behind a session token, or null. The user is found by the token's id, never by
 * its email: an admin can change someone's email and give the old address to a new account, and the
 * old cookie must not sign in as that new person. A token whose email no longer matches is refused
 * too, so an email change ends the session. A deactivated user is blocked on their very next request.
 */
export const userFromToken = async (token: string | null | undefined): Promise<User | null> => {
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id?: string | number; email?: string };
        if (decoded.id === undefined || decoded.id === null || !/^\d{1,18}$/.test(String(decoded.id))) return null;
        const user = await userServices.findById(String(decoded.id));
        if (!user || !user.active) return null;
        if (typeof decoded.email === "string" && decoded.email.toLowerCase() !== String(user.email).toLowerCase()) return null;
        return user;
    } catch {
        return null;
    }
};

/**
 * While must_change_password is set (an invited user still on the temporary password, page 10),
 * the only thing they may do is choose their own password. /auth/me and /auth/logout don't pass
 * through requireAuth, so they keep working.
 */
const PASSWORD_CHANGE_PATHS = ["/api/auth/change-password"];

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const user = await userFromToken(tokenOf(req));
    if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
    }
    const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, "");
    if (user.must_change_password && !PASSWORD_CHANGE_PATHS.includes(path)) {
        return res.status(403).json({
            message: "Choose a new password before you continue.",
            code: "must_change_password",
            must_change_password: true,
        });
    }
    req.user = userServices.toPublicUser(user);
    next();
};

export const requireRoles = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
};

export const requireRole = (...roles: string[]) => requireRoles(...roles);
