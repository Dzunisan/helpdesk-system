import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { passwordRules } from "@/lib/passwordRules";

interface PasswordChecklistProps {
  password: string;
  confirm: string;
  className?: string;
}

/** Live checklist of the shared password rules (briefing p.36) */
export default function PasswordChecklist({ password, confirm, className }: PasswordChecklistProps) {
  return (
    <ul aria-label="Password rules" className={cn("grid gap-1 text-xs", className)}>
      {passwordRules(password, confirm).map((rule) => (
        <li
          key={rule.id}
          className={cn(
            "flex items-center gap-1.5",
            rule.met ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          {rule.met ? (
            <CircleCheckIcon aria-hidden className="size-3.5" />
          ) : (
            <CircleIcon aria-hidden className="size-3.5" />
          )}
          {rule.label}
          <span className="sr-only">{rule.met ? "(done)" : "(not yet)"}</span>
        </li>
      ))}
    </ul>
  );
}
