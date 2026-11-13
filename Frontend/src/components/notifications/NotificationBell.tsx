import { Bell, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

interface NotificationBellProps {
  /** Which edge of the bell the panel lines up with: "start" in the staff sidebar, "end" in top bars */
  align?: "start" | "end";
}

/**
 * S9 SLOT (briefing p.18, p.51): the bell + panel, mounted once in AppLayout's staff sidebar, the
 * staff phone bar and the portal top bar. OWNER: the notifications feature, which replaces the body
 * of this component (red dot from services/notifications.ts getUnreadCount polled every
 * NOTIFICATION_POLL_MS, Popover panel grouped Today / Earlier, "Mark all as read", a link to
 * Profile -> Notifications). Keep the name, the props and the trigger size so AppLayout needn't change.
 * Until then it says where updates go instead of being a dead button.
 */
export default function NotificationBell({ align = "end" }: NotificationBellProps) {
  const { user } = useAuth();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="size-9 text-muted-foreground hover:text-foreground">
          <Bell />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 gap-3 p-4">
        <PopoverHeader className="gap-1">
          <PopoverTitle className="text-sm font-semibold">Notifications</PopoverTitle>
          <PopoverDescription className="text-sm">
            Replies, assignments and status changes are emailed to you.
          </PopoverDescription>
        </PopoverHeader>
        {user?.email && (
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium text-foreground">{user.email}</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
