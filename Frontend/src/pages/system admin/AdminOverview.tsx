import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleCheck, UserRoundX } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import StatCard from "@/components/app/StatCard";
import { fetchAdminOverview, type AdminOverview as Overview } from "@/services/reportService";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Overview };

const leadInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/**
 * System Admin home (briefing p.60): organisation totals, the department table
 * (counts only, so HR stays private) and a set-up checklist for broken configuration.
 */
export default function AdminOverview() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminOverview()
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Mzansi Freight · organisation set-up and totals" />

      {state.status === "error" && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load the overview</EmptyTitle>
            <EmptyDescription>{state.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {state.status === "loading" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {state.status === "ready" && <OverviewBody data={state.data} />}
    </div>
  );
}

function OverviewBody({ data }: { data: Overview }) {
  const { totals, departments, checklist } = data;
  const noLead = checklist.departments_without_lead;
  const allSet = noLead.length === 0 && checklist.users_without_department === 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active users"
          value={totals.active_users}
          hint={`${totals.inactive_users} deactivated`}
        />
        <StatCard
          label="Departments"
          value={`${totals.active_departments} active`}
          hint={`${totals.inactive_departments} inactive`}
        />
        <StatCard label="Open tickets" value={totals.open_tickets} hint="across all departments" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">Departments</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Department</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead className="text-right">Agents</TableHead>
                    <TableHead className="pr-4 text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No departments yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    departments.map((d) => (
                      <TableRow key={d.department_id}>
                        <TableCell className="pl-4 font-medium">
                          {d.department_name}
                          {d.status !== "active" && (
                            <Badge variant="outline" className="ml-2 text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.lead_name ? (
                            <span className="flex items-center gap-2">
                              <Avatar size="sm">
                                <AvatarFallback className="text-[10px]">
                                  {leadInitials(d.lead_name)}
                                </AvatarFallback>
                              </Avatar>
                              {d.lead_name}
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No lead
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{d.agents}</TableCell>
                        <TableCell className="pr-4 text-right tabular-nums">{d.open_tickets}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="border-t text-xs text-muted-foreground">
            Counts only. System Admins don&apos;t read ticket contents, so HR stays private.
          </CardFooter>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-sm">Set-up checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm">
              {noLead.map((d) => (
                <li key={d.department_id} className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="flex-1">{d.department_name} has no department lead</span>
                  <Link
                    to="/system-admin/departments"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Appoint lead <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
              {checklist.users_without_department > 0 && (
                <li className="flex items-start gap-2">
                  <UserRoundX className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="flex-1">
                    {checklist.users_without_department}{" "}
                    {checklist.users_without_department === 1 ? "user has" : "users have"} no
                    department (can&apos;t submit or claim)
                  </span>
                  <Link
                    to="/system-admin/users"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Fix users <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              )}
              {allSet && (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  Every department has a lead and every user has a department.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
