import { BrowserRouter, Routes, Route } from "react-router-dom";

import SignInPage from "../pages/Auth pages/SignInPage";
import ProtectedRoute from "../components/ProtectedRoute";
import AppLayout from "../components/app/AppLayout";

import EmployeeSubmitRequest from "../pages/employee/EmployeeSubmitRequest";
import EmployeeDashboard from "../pages/employee/EmployeeDashboard";
import TicketDetails from "../pages/tickets/TicketDetails";

import TicketQueue from "../pages/agent/TicketQueue";
import AssignedTickets from "../pages/agent/AssignedTickets";
import ResolvedTickets from "../pages/agent/ResolvedTickets";
import Dashboard from "../pages/agent/Dashboard";

import Reports from "../pages/department lead/Reports";
import TeamAgents from "../pages/department lead/TeamAgents";
import Approvals from "../pages/department lead/Approvals";

import Users from "../pages/users/Users";
import Departments from "../pages/system admin/Departments";
import AdminOverview from "../pages/system admin/AdminOverview";
import PlatformOverview from "../pages/platform admin/PlatformOverview";
import UserProfile from "../pages/user profile/UserProfile";

import ForgotPasswordPage from "../pages/Auth pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/Auth pages/ResetPasswordPage";
import NotFound from "../pages/NotFound";

const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected Employee Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Employee"]} />}>
          <Route path="/employee" element={<AppLayout />}>
            <Route index element={<EmployeeDashboard />} />
            <Route path="my-requests" element={<EmployeeDashboard />} />
            <Route path="tickets/:id" element={<TicketDetails />} />
            <Route path="submit-request" element={<EmployeeSubmitRequest />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected Agent Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Agent"]} />}>
          <Route path="/agent" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="ticket-queue" element={<TicketQueue />} />
            <Route path="assigned-tickets" element={<AssignedTickets />} />
            <Route path="resolved-tickets" element={<ResolvedTickets />} />
            <Route path="tickets/:id" element={<TicketDetails />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected Department Lead Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Department Lead"]} />}>
          <Route path="/department-lead" element={<AppLayout />}>
            {/* The lead's home is the department ticket list until the S8 dashboard (p.55) */}
            <Route index element={<TicketQueue />} />
            <Route path="ticket-queue" element={<TicketQueue />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="team" element={<TeamAgents />} />
            <Route path="reports" element={<Reports />} />
            <Route path="tickets/:id" element={<TicketDetails />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected System Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={["System Admin"]} />}>
          <Route path="/system-admin" element={<AppLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<Users />} />
            <Route path="departments" element={<Departments />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected Platform Admin Routes (no ticket access) */}
        <Route element={<ProtectedRoute allowedRoles={["Platform Admin"]} />}>
          <Route path="/platform-admin" element={<AppLayout />}>
            <Route index element={<PlatformOverview />} />
            <Route path="users" element={<Users />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Unknown URLs: a real 404, inside the user's own layout when signed in (briefing p.69) */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;
