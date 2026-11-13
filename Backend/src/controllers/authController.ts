import { Request, Response, NextFunction } from "express";
import * as userServices from "../services/userService";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendPasswordResetEmail } from "../utils/mailer";
import crypto from "crypto";
import { JWT_SECRET } from "../config/env";
import { passwordProblem } from "../utils/passwordRules";

const COOKIE_NAME = "session";
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 1000 * 60 * 60, 
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
    const {email, password} = req.body
    if(!email || !password) {
        return res.status(400).json({message: "All fields are required"})
    }
     const invalidCredentials = () => res.status(401).json({message: "Invalid email or password"});

    try {
        
        const user = await userServices.findUserByEmail(email);
        if(!user) {

           return invalidCredentials()
        }
        const isPasswordValid = await bcrypt.compare(password, user.password || "");
        // Same generic message for unknown, wrong or deactivated, so the response never reveals which
        if(!isPasswordValid || !user.active) {

            return invalidCredentials()
        }
        const token = jwt.sign({id: user.user_id, email: user.email, role: user.role}, JWT_SECRET, {expiresIn: "1h"})
        res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

        // S1: stamp last_login_at. must_change_password in the response sends a first sign-in to /change-password
        const signedIn = (await userServices.stampLastLogin(user.user_id)) ?? user;
        res.status(200).json({ user: userServices.toPublicUser(signedIn) })
    } 
    catch (error) {

        next(error)
    }
}

    export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
        res.status(200).json({message: "Logged out successfully"})
    } catch (error) {
        next(error)
    }
} 
export const me = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE_NAME];
    // console.log(" token received:", token);
    if(!token) {
        return res.status(401).json({message: "Not authenticated"})
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
        const user = await userServices.findUserByEmail(decoded.email);

        if(!user || !user.active) {
            return res.status(401).json({message: "Not authenticated"})
        }
        res.status(200).json({ user: userServices.toPublicUser(user) })
    } catch (error) {
        return res.status(401).json({message: "Not authenticated"})
    }
}

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  const genericResponse = {
    message: "Check your inbox. A password reset link will arrive shortly for any account linked to that email address..",
  };

   try {
    const user = await userServices.findUserByEmail(email);

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 1000 * 60 * 30);

      await userServices.setResetToken(user.user_id, token, expiry);

      await sendPasswordResetEmail(user.email, token);
    }
  } catch (error) {
    console.error("Forgot password: could not send the reset email.");
  }

  return res.status(200).json(genericResponse);
};

/**
 * Lets the reset page check its link on load (briefing p.36), so a missing or expired
 * token shows "This link has expired" before the user types anything.
 * Returns the account email only to the holder of a valid token.
 */
export const verifyResetToken = async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.body;
  try {
    const user = token ? await userServices.findUserByResetToken(token) : null;
    if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }
    return res.status(200).json({ email: user.email });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Token and new password are required." });
  }
  const problem = passwordProblem(newPassword);
  if (problem) {
    return res.status(400).json({ message: problem });
  }

  const user = await userServices.findUserByResetToken(token);

  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ message: "Invalid or expired reset token." });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await userServices.updatePasswordAndClearToken(user.user_id, hashed);

  return res.status(200).json({ message: "Password has been reset successfully." });
};

/**
 * POST /api/auth/change-password { current_password, new_password } -> { user }
 * Any signed-in user (requireAuth). The first sign-in with a temporary password ends here (S1):
 * it clears must_change_password. 400 for a wrong current password or a weak new one.
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  const { current_password, new_password } = req.body ?? {};
  if (typeof current_password !== "string" || current_password === "") {
    return res.status(400).json({ message: "Enter your current password.", errors: ["Enter your current password."] });
  }
  const problem = passwordProblem(new_password);
  if (problem) {
    return res.status(400).json({ message: problem, errors: [problem] });
  }
  if (new_password === current_password) {
    const message = "Choose a new password that is different from the current one.";
    return res.status(400).json({ message, errors: [message] });
  }

  try {
    const user = await userServices.findById(String(req.user!.user_id));
    if (!user || !user.active) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const matches = await bcrypt.compare(current_password, user.password || "");
    if (!matches) {
      const message = "Your current password is wrong.";
      return res.status(400).json({ message, errors: [message] });
    }
    const updated = await userServices.setOwnPassword(user.user_id, new_password);
    return res.status(200).json({ user: userServices.toPublicUser(updated ?? user) });
  } catch (error) {
    next(error);
  }
};
