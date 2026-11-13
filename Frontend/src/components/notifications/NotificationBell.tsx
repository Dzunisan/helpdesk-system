import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, ArrowRight, Bell, BellOff, CheckCheck, Star, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { formatSast } from "@/lib/format";
import { profilePathFor } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/api";
import EmptyState from "@/components/app/EmptyState";
import ErrorState from "@/components/app/ErrorState";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotifications } from "./useNotifications";

interface NotificationBellProps {
  /** Which edge of the bell the panel lines up with: "start" in the staff sidebar, "end" in top bars */
  align?: "start" | "end";
}

type Filter = "all" | "unread";

/** Where a notification goes when it has no path of its own (older rows) */
function fallbackPath(role: string | null | undefined, ticketId: number | null): string | null {
  if (!ticketId) return null;
  if (role === "Employee") return `/employee/tickets/${ticketId}`;
  if (role === "Agent") return `/agent/tickets/${ticketId}`;
  if (role === "Department Lead") return `/department-lead/tickets/${ticketId}`;
  return null;
}

/**
 * The bell + panel (S9, briefing p.18, p.51), in the staff sidebar, the staff phone bar and the
 * portal top bar. A red dot with the unread count, polled every 30 seconds; the panel lists the
 * newest 30, All / Unread, grouped Today / Earlier; unread items are tinted with a blue dot.
 * Clicking one marks it read and opens the ticket; "Mark all as read" clears the count.
 */
export default function NotificationBell({ align = "end" }: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState(false);

  const go = (item: AppNotification) => {
    const path = item.path ?? fallbackPath(user?.role, item.ticket_id);
    if (path) navigate(path);
  };

  const { unread, panel, load, markRead, markAllRead } = useNotifications({
    enabled: !!user,
    onArrived: (latest) => {
      if (open) return void load();
      toast(latest.title, {
        description: latest.body ?? undefined,
        icon: latest.type === "sla_breached" ? <AlarmClock className="size-4 text-destructive" /> : <Bell className="size-4" />,
        action: latest.path || latest.ticket_id ? { label: "Open", onClick: () => go(latest) } : undefined,
      });
    },
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setFilter("all");
      void load();
    }
  };

  const openItem = (item: AppNotification) => {
    void markRead(item);
    setOpen(false);
    go(item);
  };

  const onMarkAll = async () => {
    setMarking(true);
    try {
      await markAllRead();
    } catch (err) {
      toast.error("Couldn't mark everything as read", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setMarking(false);
    }
  };

  const items = panel.items ?? [];
  const shown = filter === "unread" ? items.filter((n) => !n.read_at) : items;
  const today = formatSast(new Date(), "day");
  const groups = [
    { label: "Today", items: shown.filter((n) => formatSast(n.created_at, "day") === today) },
    { label: "Earlier", items: shown.filter((n) => formatSast(n.created_at, "day") !== today) },
  ].filter((g) => g.items.length > 0);
  const countLabel = unread > 99 ? "99+" : String(unread);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative size-9 text-muted-foreground hover:text-foreground"
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-background"
            >
              {countLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} className="w-[23rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onMarkAll()}
              disabled={unread === 0 || marking || !panel.items}
              className="-mr-2 h-8 text-primary hover:text-primary"
            >
              <CheckCheck data-icon="inline-start" />
              Mark all as read
            </Button>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList aria-label="Which notifications">
              <TabsTrigger value="all" className="px-3">
                All
              </TabsTrigger>
              <TabsTrigger value="unread" className="px-3">
                Unread
                {unread > 0 && <span className="text-muted-foreground tabular-nums">{countLabel}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />

        {panel.error && !panel.items ? (
          <div className="p-4">
            <ErrorState
              stacked
              title="Couldn't load notifications"
              description={panel.error.status === 0 ? undefined : panel.error.message}
              onRetry={() => void load()}
              retrying={panel.loading}
            />
          </div>
        ) : !panel.items ? (
          <PanelSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState
            size="compact"
            icon={filter === "unread" ? CheckCheck : BellOff}
            title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
            description={
              filter === "unread"
                ? "Nothing new since you last looked."
                : "Replies, assignments and decisions on your tickets show up here."
            }
            className="py-8"
          />
        ) : (
          <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[min(26rem,60svh)]">
            <div className="flex flex-col gap-1 p-2">
              {groups.map((group) => (
                <section key={group.label} aria-label={group.label} className="flex flex-col gap-0.5">
                  <h3 className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </h3>
                  {group.items.map((item) => (
                    <NotificationItem key={item.notification_id} item={item} today={today} onOpen={() => openItem(item)} />
                  ))}
                </section>
              ))}
            </div>
          </ScrollArea>
        )}

        <Separator />
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="truncate text-xs text-muted-foreground">Emails follow your settings</span>
          <Button asChild variant="link" size="sm" className="h-8 shrink-0 px-0">
            <Link to={`${profilePathFor(user?.role ?? undefined)}#notifications`} onClick={() => setOpen(false)}>
              Notification settings
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The system's own items get an icon instead of an avatar; breaches are rose (p.51) */
const SYSTEM_ICON: Partial<Record<AppNotification["type"], { icon: LucideIcon; tone: string }>> = {
  sla_breached: { icon: AlarmClock, tone: "bg-destructive/10 text-destructive" },
  csat_requested: { icon: Star, tone: "bg-primary/10 text-primary" },
};

/** "Thabo Nkosi replied on HD-1048": the person in bold, the ticket ref in mono, "breached" in rose */
function TitleText({ item }: { item: AppNotification }) {
  const actor = item.actor?.name;
  const rest = actor && item.title.startsWith(actor) ? item.title.slice(actor.length) : item.title;
  const parts = rest.split(/(HD-\d+|breached)/g);
  return (
    <>
      {actor && rest !== item.title && <span className="font-semibold text-foreground">{actor}</span>}
      {parts.map((part, i): ReactNode => {
        if (/^HD-\d+$/.test(part))
          return (
            <span key={i} className="font-mono text-[12px] font-medium text-foreground">
              {part}
            </span>
          );
        if (part === "breached" && item.type === "sla_breached")
          return (
            <span key={i} className="font-semibold text-destructive">
              {part}
            </span>
          );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function NotificationItem({ item, today, onOpen }: { item: AppNotification; today: string; onOpen: () => void }) {
  const unread = !item.read_at;
  const system = !item.actor || item.type === "sla_breached";
  const icon = SYSTEM_ICON[item.type];
  const IconComp = icon?.icon ?? Bell;
  const when =
    formatSast(item.created_at, "day") === today
      ? formatSast(item.created_at, "time")
      : formatSast(item.created_at, "day").split(" ")[0];

  return (
    <Item
      asChild
      size="sm"
      className={cn(
        "cursor-pointer flex-nowrap items-start gap-3 px-2.5 py-2.5 text-left hover:bg-muted focus-visible:bg-muted",
        unread && "bg-primary/[0.04]",
      )}
    >
      <button type="button" onClick={onOpen} aria-label={`${unread ? "Unread: " : ""}${item.title}`}>
        <ItemMedia className="self-start! translate-y-0!">
          {system ? (
            <span className={cn("flex size-8 items-center justify-center rounded-full", icon?.tone ?? "bg-muted text-muted-foreground")}>
              <IconComp className="size-4" aria-hidden />
            </span>
          ) : (
            <UserAvatar name={item.actor?.name} />
          )}
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="line-clamp-2 block text-[13px] leading-snug font-normal text-foreground/90">
            <TitleText item={item} />
          </ItemTitle>
          {item.body && <ItemDescription className="line-clamp-1 text-xs">{item.body}</ItemDescription>}
        </ItemContent>
        <span className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          <time dateTime={item.created_at} title={formatSast(item.created_at, "full")} className="text-[11px] text-muted-foreground tabular-nums">
            {when}
          </time>
          {unread && <span aria-hidden className="size-2 rounded-full bg-primary" />}
        </span>
      </button>
    </Item>
  );
}

function PanelSkeleton() {
  const SK = "bg-foreground/[0.07]";
  return (
    <div aria-busy="true" aria-label="Loading notifications" className="flex flex-col gap-1 p-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 px-2.5 py-2.5">
          <Skeleton className={cn("size-8 shrink-0 rounded-full", SK)} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-3/4" : "w-full", SK)} />
            <Skeleton className={cn("h-3 w-1/2", SK)} />
          </div>
          <Skeleton className={cn("h-3 w-8", SK)} />
        </div>
      ))}
    </div>
  );
}
