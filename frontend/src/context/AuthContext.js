import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.auth.getCurrentUser());
  const [token, setToken] = useState(() => api.auth.getToken());
  const [loading, setLoading] = useState(true);

  // Validate token with server on mount
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const storedToken = api.auth.getToken();
      if (!storedToken) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const profile = await api.auth.me();
        if (isMounted) {
          setUser(profile);
          localStorage.setItem('ess_user', JSON.stringify(profile));
        }
      } catch (err) {
        console.warn('Session expired or invalid, logging out', err);
        if (isMounted) {
          api.auth.logout();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAuth();

    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('ess-unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('ess-unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.auth.login(username, password);
    setUser(data.user);
    setToken(data.access_token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    api.auth.logout();
    setUser(null);
    setToken(null);
  }, []);

  const hasRole = useCallback((...roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  }, [user]);

  const value = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    loading,
    login,
    logout,
    hasRole,
    isAdmin: user?.role === 'ADMIN',
    isAuditor: user?.role === 'AUDITOR',
    isProctor: user?.role === 'PROCTOR',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
