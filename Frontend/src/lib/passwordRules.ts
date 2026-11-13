/**
 * The ONE password rule set (briefing p.36): 8+ characters, upper AND lower case,
 * at least one number, and the confirmation must match.
 * Used by the reset-password page and the profile page's change-password form.
 * The server enforces the same rules in Backend/src/utils/passwordRules.ts; keep both in step.
 */

export interface PasswordRule {
  id: "length" | "case" | "number" | "match";
  label: string;
  met: boolean;
}

export const passwordRules = (password: string, confirm: string): PasswordRule[] => [
  { id: "length", label: "At least 8 characters", met: password.length >= 8 },
  {
    id: "case",
    label: "Upper- and lower-case letters",
    met: /[A-Z]/.test(password) && /[a-z]/.test(password),
  },
  { id: "number", label: "At least one number", met: /[0-9]/.test(password) },
  { id: "match", label: "Passwords match", met: password.length > 0 && password === confirm },
];

/** True when every rule, including "Passwords match", is met */
export const passwordAcceptable = (password: string, confirm: string): boolean =>
  passwordRules(password, confirm).every((rule) => rule.met);
