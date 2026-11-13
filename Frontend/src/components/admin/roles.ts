/** Sentence-case display names for the stored role values */
export const ROLE_LABEL: Record<string, string> = {
  Employee: "Employee",
  Agent: "Agent",
  "Department Lead": "Department lead",
  "System Admin": "System admin",
  "Platform Admin": "Platform admin",
};

export const roleLabel = (role: string | null | undefined) => (role ? ROLE_LABEL[role] ?? role : "—");
