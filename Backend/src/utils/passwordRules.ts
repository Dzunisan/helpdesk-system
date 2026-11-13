/**
 * The ONE password rule set (briefing p.36): 8+ characters, upper AND lower case,
 * at least one number. Used by reset-password and the profile password update.
 * The frontend mirrors these rules in Frontend/src/lib/passwordRules.ts; keep both in step.
 */
export const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "at least 8 characters", test: (p) => p.length >= 8 },
  { label: "upper- and lower-case letters", test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: "at least one number", test: (p) => /[0-9]/.test(p) },
];

/** Returns null when the password is acceptable, otherwise one message naming every missing rule. */
export const passwordProblem = (password: unknown): string | null => {
  if (typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
  if (missing.length === 0) return null;
  return `Password needs ${missing.join(", ")}.`;
};
