import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from '../context/AuthContext';
import { homePathFor } from '../lib/roles';

interface ProtectedRouteProps {
  allowedRoles: Role[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center loader"></div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If user's role is not in the allowedRoles list, redirect to their specific home page
    // (We could also redirect to an "Unauthorized" page, but for now we'll route them back home)
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
