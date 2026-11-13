import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import { useUsers } from "@/context/UsersContext";
import { initials } from "@/lib/roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Platform Admin home (briefing p.66). States the rule up front: this account
 * manages the system (System Admin accounts), never tickets, comments or notes.
 */
export default function PlatformOverview() {
  // For a Platform Admin, UsersContext is already scoped to System Admins
  const { users: systemAdmins, loading } = useUsers();
  const active = systemAdmins.filter((u) => u.active).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Helpdesk for Mzansi Freight" />

      <div
        role="note"
        className="flex items-start gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium">Platform Admins manage the system, not the data.</span>{" "}
          Tickets, comments and notes are not visible from this account.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="System admins"
          value={loading ? <Skeleton className="h-8 w-10" /> : systemAdmins.length}
          hint={loading ? undefined : `${active} active · ${systemAdmins.length - active} deactivated`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">System admins</CardTitle>
          <CardAction>
            <Button asChild variant="link" size="sm" className="px-0">
              <Link to="/platform-admin/users">
                Manage <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : systemAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No system admins yet.{" "}
              <Link to="/platform-admin/users" className="font-medium text-primary hover:underline">
                Add one
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {systemAdmins.map((admin) => (
                <li key={admin.user_id} className="flex items-center gap-3 py-2.5">
                  <Avatar size="sm">
                    <AvatarFallback className="text-[10px]">{initials(admin)}</AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-medium">
                      {`${admin.name} ${admin.surname ?? ""}`.trim()}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
                  </span>
                  {!admin.active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Deactivated
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
