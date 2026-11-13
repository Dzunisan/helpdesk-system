import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlarmClock,
  Bell,
  Building2,
  ChevronsUpDown,
  CircleCheck,
  ClipboardCheck,
  Hourglass,
  House,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Menu,
  Plus,
  Shapes,
  ShieldCheck,
  Timer,
  UserRound,
  UserRoundX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth, type Role, type User } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { fetchTickets } from "@/services/ticketService";
import { fullName, homePathFor, profilePathFor } from "@/lib/roles";
import { cn } from "@/lib/utils";
import BrandMark from "@/components/app/BrandMark";
import UserAvatar from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { NavHighlightContext, useNavHighlightHref } from "./navHighlight";
import { AGENT_QUEUE_LABEL, agentQueuePath } from "@/components/queue/queueViews";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * The one layout for every signed-in page (briefing p.32).
 * Staff roles get the shadcn Sidebar shell (sidebar-07 style, 220px, p.46-48, 54, 60, 66);
 * employees get the calm portal: a top bar and full-width content (p.37, p.45).
 * Pages add NO outer padding: the shell pads them (PAGE_PADDING) so every page and the
 * top bar share one left edge. Renders `children` when given (the 404 page), otherwise the route's <Outlet />.
 */

/** Side and vertical padding of every page; the portal top bar uses the same sides */
const PAGE_X = "px-6 sm:px-10 lg:px-16 xl:px-24";
const PAGE_PADDING = `${PAGE_X} py-8 sm:py-10`;

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Only active on an exact path match (index routes) */
  end?: boolean;
  /** Also active on these path prefixes (e.g. ticket detail pages under a list) */
  alsoActive?: string[];
}

interface NavGroup {
  /** "department" puts the user's department name here, like the mockups */
  label?: string | "department";
  items: NavItem[];
}

// Only routes that exist in AppRouter. Mockup items from later sprints (Macros, Help articles,
// Reports, Business hours, Audit log) are left out until built.
const STAFF_NAV: Partial<Record<NonNullable<Role>, NavGroup[]>> = {
  Agent: [
    {
      items: [
        { label: "Home", icon: House, href: "/agent", end: true },
        { label: AGENT_QUEUE_LABEL["my-open"], icon: Inbox, href: agentQueuePath("my-open") },
        { label: AGENT_QUEUE_LABEL.unassigned, icon: UserRoundX, href: agentQueuePath("unassigned") },
        { label: AGENT_QUEUE_LABEL.waiting, icon: Hourglass, href: agentQueuePath("waiting") },
        { label: AGENT_QUEUE_LABEL.breached, icon: AlarmClock, href: agentQueuePath("breached") },
        { label: AGENT_QUEUE_LABEL.resolved, icon: CircleCheck, href: agentQueuePath("resolved") },
      ],
    },
  ],
  "Department Lead": [
    {
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/department-lead", end: true },
        {
          label: "All tickets",
          icon: List,
          href: "/department-lead/all-tickets",
          alsoActive: ["/department-lead/tickets/"],
        },
        { label: "Approvals", icon: ClipboardCheck, href: "/department-lead/approvals" },
      ],
    },
    {
      label: "department",
      items: [{ label: "Team & workload", icon: Users, href: "/department-lead/team" }],
    },
  ],
  "System Admin": [
    {
      items: [
        { label: "Overview", icon: House, href: "/system-admin", end: true },
        { label: "Users", icon: Users, href: "/system-admin/users" },
        { label: "Departments", icon: Building2, href: "/system-admin/departments" },
        { label: "Categories & routing", icon: Shapes, href: "/system-admin/categories" },
        { label: "SLA policies", icon: Timer, href: "/system-admin/sla" },
      ],
    },
  ],
  "Platform Admin": [
    {
      items: [
        { label: "Overview", icon: House, href: "/platform-admin", end: true },
        { label: "System admins", icon: ShieldCheck, href: "/platform-admin/users" },
      ],
    },
  ],
};

const ROLE_SHORT: Record<NonNullable<Role>, string> = {
  Employee: "Employee",
  Agent: "Agent",
  "Department Lead": "Lead",
  "System Admin": "System Admin",
  "Platform Admin": "Platform Admin",
};

/** Active when the URL matches, unless the page named its own nav item (see navHighlight) */
const isActive = (pathname: string, item: NavItem, highlight?: string | null) => {
  if (highlight) return item.href === highlight;
  const own = item.end ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return own || !!item.alsoActive?.some((prefix) => pathname.startsWith(prefix));
};

const OPEN_STATUSES = new Set(["Resolved", "Closed", "Cancelled"]);

/**
 * Work counts beside the nav items (p.46 "My open 5", "Unassigned 12"; p.54 "Approvals 3").
 * Uses the same requests and filters as the pages they link to, refreshes on every page
 * change and when the window regains focus. Counts are a nicety: failures show nothing.
 */
function useNavCounts(user: User): Record<string, number> {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const userId = user.user_id ?? user.id;
  const departmentId = user.department_id ?? undefined;
  const role = user.role;

  useEffect(() => {
    if (role !== "Agent" && role !== "Department Lead") return;
    let cancelled = false;

    const load = async () => {
      try {
        if (role === "Agent") {
          const [mine, queue] = await Promise.all([
            fetchTickets({ assignee_id: userId ? String(userId) : undefined, limit: 100 }),
            fetchTickets({ status: "New", department_id: departmentId ? Number(departmentId) : undefined, limit: 100 }),
          ]);
          if (cancelled) return;
          setCounts({
            [agentQueuePath("my-open")]: mine.tickets.filter((t) => !OPEN_STATUSES.has(t.ticket_status)).length,
            [agentQueuePath("unassigned")]: queue.tickets.filter((t) => !t.assignee_id).length,
          });
        } else {
          const approvals = await fetchTickets({ status: "Pending approval", limit: 50 });
          if (cancelled) return;
          setCounts({ "/department-lead/approvals": approvals.pagination?.total ?? approvals.tickets.length });
        }
      } catch {
        // A count is not worth an error message
      }
    };

    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [role, userId, departmentId, pathname]);

  return counts;
}

/**
 * The bell. In-app notifications are not built yet; the backend emails replies,
 * assignments and status changes, so the bell says where they go instead of being a dead button.
 */
function NotificationsButton({ user, align = "end" }: { user: User; align?: "start" | "end" }) {
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
        {user.email && (
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium text-foreground">{user.email}</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Profile and sign-out items shared by both layouts */
function UserMenuItems({ user }: { user: User }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
        <UserAvatar name={fullName(user)} />
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{fullName(user)}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={() => navigate(profilePathFor(user.role))}>
          <UserRound />
          Profile
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
        <LogOut />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

const NAV_BUTTON =
  "h-9 gap-2.5 rounded-lg px-2 text-sidebar-foreground/80 transition-colors max-md:h-10 " +
  "hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground active:bg-sidebar-foreground/10 " +
  "[&>svg]:text-muted-foreground hover:[&>svg]:text-sidebar-foreground " +
  "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground " +
  "data-active:hover:bg-sidebar-accent data-active:[&>svg]:text-primary";

function StaffSidebar({ user }: { user: User }) {
  const { pathname } = useLocation();
  // A ticket page names the list it belongs to (My open, Unassigned, Approvals…)
  const highlight = useNavHighlightHref();
  const { isMobile, setOpenMobile } = useSidebar();
  const departmentName = useDepartmentName(user.department_id);
  const counts = useNavCounts(user);
  const groups = (user.role && STAFF_NAV[user.role]) || [];
  const roleLabel = user.role ? ROLE_SHORT[user.role] : "";
  const subtitle = departmentName ? `${roleLabel} · ${departmentName}` : roleLabel;

  // On a phone the sidebar is a sheet: close it after choosing a page
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-between gap-2 pt-4 pr-3 pb-3 pl-5">
        <NavLink
          to={homePathFor(user.role)}
          onClick={closeOnMobile}
          className="flex min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
        </NavLink>
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            className="size-10 text-muted-foreground"
            onClick={() => setOpenMobile(false)}
          >
            <X />
          </Button>
        ) : (
          <NotificationsButton user={user} align="start" />
        )}
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 py-1">
        {groups.map((group, index) => {
          const label = group.label === "department" ? departmentName : group.label;
          return (
            <SidebarGroup key={index} className="px-1 py-1">
              {label && (
                <SidebarGroupLabel className="h-7 px-2 text-xs font-medium text-muted-foreground">{label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item, highlight);
                    const count = counts[item.href];
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton asChild isActive={active} className={NAV_BUTTON}>
                          <NavLink to={item.href} end={item.end} onClick={closeOnMobile}>
                            <item.icon />
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {!!count && (
                              <span
                                className={cn(
                                  "ml-auto shrink-0 text-xs font-medium tabular-nums",
                                  active ? "text-primary" : "text-muted-foreground",
                                )}
                                aria-label={`${count} ${item.label.toLowerCase()}`}
                              >
                                {count}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-14 gap-2.5 rounded-lg px-2 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-foreground/5"
                >
                  <UserAvatar name={fullName(user)} />
                  <span className="grid min-w-0 flex-1 text-left leading-tight" title={`${fullName(user)} · ${subtitle}`}>
                    <span className="truncate text-sm font-medium">{fullName(user)}</span>
                    <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={8}
                className="min-w-60"
              >
                <UserMenuItems user={user} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Phones and small tablets: the sidebar opens as a sheet from this bar */
function StaffMobileBar({ user }: { user: User }) {
  const { toggleSidebar } = useSidebar();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-6 backdrop-blur sm:px-10 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        className="-ml-3 size-10"
        onClick={toggleSidebar}
      >
        <Menu />
      </Button>
      <NavLink
        to={homePathFor(user.role)}
        className="flex min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark />
      </NavLink>
      <div className="ml-auto">
        <NotificationsButton user={user} />
      </div>
    </header>
  );
}

function StaffLayout({ user, children }: { user: User; children: ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "220px" } as React.CSSProperties}>
      <StaffSidebar user={user} />
      <SidebarInset className="min-w-0 bg-background">
        <StaffMobileBar user={user} />
        <div className={cn("min-w-0 flex-1", PAGE_PADDING)}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const PORTAL_NAV: NavItem[] = [
  {
    label: "My requests",
    icon: Inbox,
    href: "/employee/my-requests",
    alsoActive: ["/employee/tickets/"],
  },
  { label: "New request", icon: Plus, href: "/employee/submit-request" },
];

function PortalLayout({ user, children }: { user: User; children: ReactNode }) {
  const { pathname } = useLocation();

  // "My requests" is also the portal home
  const portalActive = (item: NavItem) =>
    isActive(pathname, item) || (item.href === "/employee/my-requests" && pathname === "/employee");

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className={cn("flex h-16 items-center gap-8", PAGE_X)}>
          <NavLink
            to="/employee"
            className="flex min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark />
          </NavLink>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {PORTAL_NAV.map((item) => {
              const active = portalActive(item);
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="-mr-1 ml-auto flex items-center gap-1">
            <NotificationsButton user={user} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu" className="size-10 rounded-full">
                  <UserAvatar name={fullName(user)} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-60">
                <UserMenuItems user={user} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Phones: the two links become full-width tabs under the bar, 44px tap targets */}
        <nav aria-label="Main" className="grid grid-cols-2 border-t border-border sm:hidden">
          {PORTAL_NAV.map((item) => {
            const active = portalActive(item);
            return (
              <NavLink
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center justify-center gap-2 text-sm font-medium transition-colors outline-none focus-visible:bg-muted",
                  active
                    ? "text-primary after:absolute after:inset-x-6 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className={cn("w-full min-w-0 flex-1", PAGE_PADDING)}>{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const [highlightHref, setHighlightHref] = useState<string | null>(null);
  const highlight = useMemo(() => ({ href: highlightHref, setHref: setHighlightHref }), [highlightHref]);
  const content = children ?? <Outlet />;

  // ProtectedRoute guarantees a user on every route that uses this layout
  if (!user) return <>{content}</>;

  return (
    <NavHighlightContext.Provider value={highlight}>
      {user.role === "Employee" ? (
        <PortalLayout user={user}>{content}</PortalLayout>
      ) : (
        <StaffLayout user={user}>{content}</StaffLayout>
      )}
    </NavHighlightContext.Provider>
  );
}
