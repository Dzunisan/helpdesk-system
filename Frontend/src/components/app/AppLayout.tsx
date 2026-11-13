import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlarmClock,
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
  Menu,
  Plus,
  Send,
  Shapes,
  ShieldCheck,
  Timer,
  UserRound,
  UserRoundX,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuth, type Role, type User } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { countTickets } from "@/services/tickets";
import type { TicketListParams } from "@/types/api";
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
import NotificationBell from "@/components/notifications/NotificationBell";
import { NavHighlightContext, useNavHighlightHref } from "./navHighlight";
import { AGENT_QUEUE_LABEL, AGENT_VIEWS, LEAD_VIEWS, agentQueuePath } from "@/components/queue/queueViews";
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

// Only routes that exist in AppRouter. Mockup items from stretch goals (Help articles, Reports,
// Business hours, Audit log) are left out until built.
const STAFF_NAV: Partial<Record<NonNullable<Role>, NavGroup[]>> = {
  Agent: [
    {
      items: [
        { label: "Home", icon: House, href: "/agent", end: true },
        { label: AGENT_QUEUE_LABEL["my-open"], icon: Inbox, href: agentQueuePath("my-open") },
        { label: AGENT_QUEUE_LABEL.unassigned, icon: UserRoundX, href: agentQueuePath("unassigned") },
        // "Waiting" (the mockup's chip word): "Waiting on employee" doesn't fit the 220px sidebar
        { label: "Waiting", icon: Hourglass, href: agentQueuePath("waiting") },
        { label: AGENT_QUEUE_LABEL.breached, icon: AlarmClock, href: agentQueuePath("breached") },
        { label: AGENT_QUEUE_LABEL.resolved, icon: CircleCheck, href: agentQueuePath("resolved") },
      ],
    },
  ],
  "Department Lead": [
    {
      items: [
        // S8: the lead's home is the dashboard (p.54)
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
      items: [
        { label: "Team & workload", icon: Users, href: "/department-lead/team" },
        // S7 macros manager (p.58)
        { label: "Macros", icon: Zap, href: "/department-lead/macros" },
      ],
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
        // S9: the outbox and Run jobs now (p.18, p.30)
        { label: "Sent messages", icon: Send, href: "/system-admin/outbox" },
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

/** The agent views that show a count beside their nav item */
const COUNTED_AGENT_VIEWS = ["my-open", "unassigned", "waiting", "breached"] as const;
/** The lead's active work: what "All tickets" counts (Breached overlaps these, so it is left out) */
const COUNTED_LEAD_TABS = ["unassigned", "open", "waiting", "pending"] as const;

/** pagination.total of one view: the same params as the page it links to (shared with its tabs) */
const countOf = (params: TicketListParams): Promise<number> => countTickets(params);

/**
 * Work counts beside the nav items (p.46 "My open 5", "Unassigned 12"; p.55 "All tickets 46").
 * Uses the same requests and filters as the pages they link to, refreshes on every page
 * change and when the window regains focus. Counts are a nicety: failures show nothing.
 */
function useNavCounts(user: User): Record<string, number> {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const userId = user.user_id ?? user.id;
  const role = user.role;

  useEffect(() => {
    if (role !== "Agent" && role !== "Department Lead") return;
    let cancelled = false;

    const load = async () => {
      try {
        if (role === "Agent") {
          const totals = await Promise.all(COUNTED_AGENT_VIEWS.map((v) => countOf(AGENT_VIEWS[v].params)));
          if (cancelled) return;
          setCounts(Object.fromEntries(COUNTED_AGENT_VIEWS.map((v, i) => [agentQueuePath(v), totals[i]])));
        } else {
          const totals = await Promise.all(COUNTED_LEAD_TABS.map((t) => countOf(LEAD_VIEWS[t].params)));
          if (cancelled) return;
          const pending = totals[COUNTED_LEAD_TABS.indexOf("pending")];
          setCounts({
            "/department-lead/all-tickets": totals.reduce((sum, n) => sum + n, 0),
            "/department-lead/approvals": pending,
          });
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
  }, [role, userId, pathname]);

  return counts;
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
          <NotificationBell align="start" />
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
        <NotificationBell />
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
            <NotificationBell />
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
