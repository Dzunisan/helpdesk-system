import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Theme-only avatar tints. The same name always gets the same tint, so
 * "Thabo Nkosi" looks the same in the queue, the ticket and the team page.
 */
const TINTS = [
  "bg-primary/10 text-primary",
  "bg-chart-5 text-secondary-foreground",
  "bg-muted text-foreground/70",
  "bg-foreground/85 text-background",
] as const;

const tintFor = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
};

const TEXT_SIZE = { sm: "text-[10px]", default: "text-xs", lg: "text-sm" } as const;

interface UserAvatarProps {
  /** Full name, e.g. "Thabo Nkosi". Initials and tint come from it. */
  name: string | null | undefined;
  /** sm = 24px (rows), default = 32px (cards, menus), lg = 40px (profile, requester card) */
  size?: "sm" | "default" | "lg";
  /** Also render the name next to the avatar */
  showName?: boolean;
  /** A muted second line under the name (role, department, email). Implies `showName`. */
  description?: ReactNode;
  /** Classes for the name line (default text-sm), e.g. "text-xs" in dense phone rows */
  nameClassName?: string;
  className?: string;
}

/**
 * Initials avatar with a consistent theme tint per person.
 * @example <UserAvatar name={t.assignee_name} size="sm" showName />
 * @example <UserAvatar name="Lerato Mokoena" description="Finance · Rosebank" />
 */
export default function UserAvatar({ name, size = "default", showName, description, nameClassName, className }: UserAvatarProps) {
  const label = name?.trim() || "Unknown";
  const avatar = (
    <Avatar size={size} className={cn(!showName && !description && className)}>
      <AvatarFallback className={cn("font-medium", TEXT_SIZE[size], tintFor(label))}>{initialsOf(label)}</AvatarFallback>
    </Avatar>
  );

  if (!showName && !description) return avatar;

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {avatar}
      <span className="grid min-w-0 leading-tight">
        <span className={cn("truncate text-sm text-foreground", nameClassName)}>{label}</span>
        {description && <span className="truncate text-xs text-muted-foreground">{description}</span>}
      </span>
    </span>
  );
}
