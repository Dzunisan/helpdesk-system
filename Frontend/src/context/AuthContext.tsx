import React, { createContext, useState, useContext, useCallback, useEffect, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '@/services/apiClient';

// Define the role types
export type Role = 'Employee' | 'Agent' | 'Department Lead' | 'System Admin' | 'Platform Admin' | null;

// Define the User shape
export interface User {
  id?: string;
  user_id?: string;
  name: string;
  surname?: string;
  email?: string;
  role: Role;
  active?: boolean;
  department_id?: number | null;
  /** When the account was created; /api/auth/me returns it */
  created_at?: string | null;
  /** Signed in with a temporary password: must choose their own first (S1, /change-password) */
  must_change_password?: boolean;
  last_login_at?: string | null;
}

interface AuthContextState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  updateAuthUser: (updatedFields: Partial<User>) => void;
  checkAuth: () => Promise<void>;
}

// Create the context
const AuthContext = createContext<AuthContextState | undefined>(undefined);

// Provide the context
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
        }
      }
    } catch (error) {
      console.error("Auth check failed", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Any API call that comes back 401 (session expired, account deactivated) signs the user out
  // here, so ProtectedRoute sends them to the sign-in page
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const updateAuthUser = (updatedFields: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedFields } : prev));
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout, updateAuthUser, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextState => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
