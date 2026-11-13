import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import SignInPage from "../pages/Auth pages/SignInPage";
import ProtectedRoute from "../components/ProtectedRoute";
import AppLayout from "../components/app/AppLayout";

import EmployeeSubmitRequest from "../pages/employee/EmployeeSubmitRequest";
import EmployeeDashboard from "../pages/employee/EmployeeDashboard";
import NewRequestDetails from "../pages/employee/NewRequestDetails";
import RequestSubmitted from "../pages/employee/RequestSubmitted";
import RequestDetail from "../pages/employee/RequestDetail";
import CsatSurvey from "../pages/employee/CsatSurvey";
import TicketDetails from "../pages/tickets/TicketDetails";

import TicketQueue from "../pages/agent/TicketQueue";
import Dashboard from "../pages/agent/Dashboard";
import { agentQueuePath } from "../components/queue/queueViews";

import TeamAgents from "../pages/department lead/TeamAgents";
import Approvals from "../pages/department lead/Approvals";
import LeadDashboard from "../pages/department lead/LeadDashboard";
import AllTickets from "../pages/department lead/AllTickets";
import MacrosManager from "../pages/department lead/MacrosManager";

import Users from "../pages/users/Users";
import Departments from "../pages/system admin/Departments";
import AdminOverview from "../pages/system admin/AdminOverview";
import Categories from "../pages/system admin/Categories";
import SlaPolicies from "../pages/system admin/SlaPolicies";
import SentMessages from "../pages/system admin/SentMessages";
import PlatformOverview from "../pages/platform admin/PlatformOverview";
import UserProfile from "../pages/user profile/UserProfile";

import ForgotPasswordPage from "../pages/Auth pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/Auth pages/ResetPasswordPage";
import ChangePasswordFirstLogin from "../pages/Auth pages/ChangePasswordFirstLogin";
import NotFound from "../pages/NotFound";

const ALL_ROLES = ["Employee", "Agent", "Department Lead", "System Admin", "Platform Admin"] as const;

const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* First sign-in with a temporary password (S1): any role */}
        <Route element={<ProtectedRoute allowedRoles={[...ALL_ROLES]} />}>
          <Route path="/change-password" element={<AppLayout />}>
            <Route index element={<ChangePasswordFirstLogin />} />
          </Route>
        </Route>

        {/* Protected Employee Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Employee"]} />}>
          <Route path="/employee" element={<AppLayout />}>
            <Route index element={<EmployeeDashboard />} />
            <Route path="my-requests" element={<EmployeeDashboard />} />
            {/* New request: 1 category tiles, 2 details, 3 submitted (S5, p.38-40) */}
            <Route path="submit-request" element={<EmployeeSubmitRequest />} />
            <Route path="submit-request/:categoryId" element={<NewRequestDetails />} />
            <Route path="tickets/:id/submitted" element={<RequestSubmitted />} />
            <Route path="tickets/:id" element={<RequestDetail />} />
            {/* S10 "How did we do?" survey, linked from the csat_requested notification (p.19, p.43) */}
            <Route path="tickets/:id/feedback" element={<CsatSurvey />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected Agent Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Agent"]} />}>
          <Route path="/agent" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            {/* My open, Unassigned, Waiting on employee, Breached, Resolved by me (p.46-47) */}
            <Route path="queue/:view" element={<TicketQueue />} />
            {/* Old addresses */}
            <Route path="ticket-queue" element={<Navigate to={agentQueuePath("unassigned")} replace />} />
            <Route path="assigned-tickets" element={<Navigate to={agentQueuePath("my-open")} replace />} />
            <Route path="resolved-tickets" element={<Navigate to={agentQueuePath("resolved")} replace />} />
            <Route path="tickets/:id" element={<TicketDetails />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>
        </Route>

        {/* Protected Department Lead Routes */}
        <Route element={<ProtectedRoute allowedRoles={["Department Lead"]} />}>
          <Route path="/department-lead" element={<AppLayout />}>
            {/* S8: the lead's home is the dashboard (p.17, p.54) */}
            <Route index element={<LeadDashboard />} />
            <Route path="dashboard" element={<Navigate to="/department-lead" replace />} />
            <Route path="all-tickets" element={<AllTickets />} />
            <Route path="ticket-queue" element={<Navigate to="/department-lead/all-tickets" replace />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="team" element={<TeamAgents />} />
            {/* S7 macros manager (p.58) */}
            <Route path="macros" element={<MacrosManager />} />
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
            <Route path="categories" element={<Categories />} />
            <Route path="sla" element={<SlaPolicies />} />
            {/* S9 sent messages (outbox) + Run jobs now (p.18) */}
            <Route path="outbox" element={<SentMessages />} />
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
