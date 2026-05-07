import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import authService from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.getUser());
  const [token, setToken] = useState(() => authService.getToken());

  const isAuthenticated = !!token;

  const save = useCallback((newToken, newUser) => {
    authService.save(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    authService.clear();
    setToken('');
    setUser(null);
    window.location.href = '/';
  }, []);

  const clear = useCallback(() => {
    authService.clear();
    setToken('');
    setUser(null);
  }, []);

  // Sync if storage changes in another tab
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'sa_token') {
        setToken(e.newValue || '');
        if (!e.newValue) setUser(null);
      }
      if (e.key === 'sa_user') {
        try { setUser(JSON.parse(e.newValue || 'null')); } catch { setUser(null); }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, save, logout, clear }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
