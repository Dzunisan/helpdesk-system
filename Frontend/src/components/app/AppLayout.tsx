import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronsUpDown,
  CircleCheck,
  ClipboardCheck,
  Clock,
  House,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  ShieldCheck,
  Siren,
  UserRound,
  UserRoundX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth, type Role, type User } from "@/context/AuthContext";
import { useDepartmentName } from "@/hooks/useDepartmentName";
import { fullName, homePathFor, initials, profilePathFor } from "@/lib/roles";
import { cn } from "@/lib/utils";
import BrandMark from "@/components/app/BrandMark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * The one layout for every signed-in page (briefing p.32).
 * Staff roles get the shadcn Sidebar shell (sidebar-07 style, 220px);
 * employees get the calm portal: a top bar and centred content.
 * Renders `children` when given (the 404 page), otherwise the route's <Outlet />.
 */

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Omit for a page that does not exist yet: it shows greyed out and is not a link */
  href?: string;
  /** Only active on an exact path match (index routes) */
  end?: boolean;
}

interface NavGroup {
  /** "department" puts the user's department name here, like the mockups */
  label?: string | "department";
  items: NavItem[];
}

// Only link to routes that exist in AppRouter. Placeholders are for Sprint 1/2 pages
// on the way (Waiting on employee, Breached, Unassigned tab); pages with no plan yet
// (Macros, Reports, Help articles) are left out.
const STAFF_NAV: Partial<Record<NonNullable<Role>, NavGroup[]>> = {
  Agent: [
    {
      items: [
        { label: "Home", icon: House, href: "/agent", end: true },
        { label: "My open", icon: Inbox, href: "/agent/assigned-tickets" },
        { label: "Unassigned", icon: UserRoundX, href: "/agent/ticket-queue" },
        { label: "Waiting on employee", icon: Clock },
        { label: "Breached", icon: Siren },
        { label: "Resolved by me", icon: CircleCheck, href: "/agent/resolved-tickets" },
      ],
    },
  ],
  "Department Lead": [
    {
      items: [
        // The lead's home is the department ticket list until the S8 dashboard (p.55)
        { label: "Dashboard", icon: LayoutDashboard, href: "/department-lead", end: true },
        { label: "All tickets", icon: List, href: "/department-lead/ticket-queue" },
        { label: "Unassigned", icon: UserRoundX },
        { label: "Approvals", icon: ClipboardCheck, href: "/department-lead/approvals" },
        { label: "Breached", icon: Siren },
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

const isActive = (pathname: string, item: NavItem) =>
  !!item.href &&
  (item.end ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

/** Logo mark + "Helpdesk / Mzansi Freight" */
function Brand({ to }: { to: string }) {
  return (
    <NavLink to={to} className="flex min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <BrandMark />
    </NavLink>
  );
}

/** Notifications arrive in Sprint 2; the bell is a placeholder until then */
function BellButton() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Notifications (coming soon)"
      title="Notifications are coming soon"
      className="text-muted-foreground"
    >
      <Bell />
    </Button>
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
      <DropdownMenuLabel className="grid font-normal">
        <span className="truncate text-sm font-medium text-foreground">{fullName(user)}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
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

function StaffSidebar({ user }: { user: User }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const departmentName = useDepartmentName(user.department_id);
  const groups = (user.role && STAFF_NAV[user.role]) || [];
  const roleLabel = user.role ? ROLE_SHORT[user.role] : "";
  const subtitle = departmentName ? `${roleLabel} · ${departmentName}` : roleLabel;

  // On a phone the sidebar is a sheet: close it after choosing a page
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-between gap-2 px-3 pt-3">
        <Brand to={homePathFor(user.role)} />
        <BellButton />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => {
          const label = group.label === "department" ? departmentName : group.label;
          return (
            <SidebarGroup key={index}>
              {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      {item.href ? (
                        <SidebarMenuButton asChild isActive={isActive(pathname, item)}>
                          <NavLink to={item.href} end={item.end} onClick={closeOnMobile}>
                            <item.icon />
                            <span>{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      ) : (
                        // Not built yet: visible so the shape of the product is clear, but not a link
                        <SidebarMenuButton
                          disabled
                          title={`${item.label}: coming soon`}
                          className="text-muted-foreground"
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm">
                    <AvatarFallback className="bg-primary text-[10px] font-medium text-primary-foreground">
                      {initials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
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
                className="min-w-56"
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

function StaffLayout({ user, children }: { user: User; children: ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "220px" } as React.CSSProperties}>
      <StaffSidebar user={user} />
      <SidebarInset className="min-w-0">
        {/* Phones and small tablets: the sidebar opens as a sheet from this bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background px-4 md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <Brand to={homePathFor(user.role)} />
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const PORTAL_NAV: NavItem[] = [
  { label: "My requests", icon: Inbox, href: "/employee/my-requests" },
  { label: "New request", icon: ClipboardCheck, href: "/employee/submit-request" },
];

function PortalLayout({ user, children }: { user: User; children: ReactNode }) {
  const { pathname } = useLocation();

  // "My requests" is also the portal home and the parent of a request's detail page
  const portalActive = (item: NavItem) =>
    item.href === "/employee/my-requests"
      ? pathname === "/employee" || isActive(pathname, item) || pathname.startsWith("/employee/tickets/")
      : isActive(pathname, item);

  const navLinks = PORTAL_NAV.map((item) => (
    <NavLink
      key={item.label}
      to={item.href!}
      className={cn(
        buttonVariants({ variant: portalActive(item) ? "secondary" : "ghost", size: "sm" }),
        !portalActive(item) && "text-muted-foreground",
      )}
    >
      {item.label}
    </NavLink>
  ));

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Brand to="/employee" />
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {navLinks}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <BellButton />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu" className="rounded-full">
                  <Avatar size="sm">
                    <AvatarFallback className="bg-primary text-[10px] font-medium text-primary-foreground">
                      {initials(user)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <UserMenuItems user={user} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Phones: the two links get their own row so nothing is squeezed at 390px */}
        <nav aria-label="Main" className="flex items-center gap-1 border-t border-border px-4 py-2 sm:hidden">
          {navLinks}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const content = children ?? <Outlet />;

  // ProtectedRoute guarantees a user on every route that uses this layout
  if (!user) return <>{content}</>;

  return user.role === "Employee" ? (
    <PortalLayout user={user}>{content}</PortalLayout>
  ) : (
    <StaffLayout user={user}>{content}</StaffLayout>
  );
}
