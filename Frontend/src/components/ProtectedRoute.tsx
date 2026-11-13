import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type Role } from '../context/AuthContext';
import { homePathFor } from '../lib/roles';
import { Spinner } from '@/components/ui/spinner';

interface ProtectedRouteProps {
  allowedRoles: Role[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Checking the session: a quiet centred spinner (the shell isn't known yet)
    return (
      <div aria-busy="true" className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If user's role is not in the allowedRoles list, redirect to their specific home page
    // (We could also redirect to an "Unauthorized" page, but for now we'll route them back home)
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  // Signed in with a temporary password: choose a new one before anything else (S1)
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
