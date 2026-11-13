
import { Request, Response, NextFunction } from "express";
import { passwordProblem } from "../utils/passwordRules";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const validateRegister = (req: Request, res: Response, next: NextFunction) => {
  const { name, email, password } = req.body;
  const errors: string[] = [];

  if (!name || typeof name !== "string" || name.trim().length === 0) {
     errors.push("Name is required.");

  } else if (name.trim().length < 2) {
     errors.push("Name must be at least 2 characters long.");
  }

   if (!email || typeof email !== "string" || email.trim().length === 0) {
     errors.push("Email is required.");

  } else if (!EMAIL_REGEX.test(email.trim())) {
     errors.push("Please provide a valid email address.");
  }

  const passwordError = passwordProblem(password);
  if (passwordError) {
    errors.push(passwordError);
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  next();
};