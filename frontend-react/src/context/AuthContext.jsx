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

  // Sync if storage changes in another tab or via extension auth bridge
  useEffect(() => {
    const handler = (e) => {
      if (['sa_token', 'sa_user', 'sa_auth'].includes(e.key)) {
        const authFlag = localStorage.getItem('sa_auth');
        const currentToken = localStorage.getItem('sa_token');

        if (authFlag === '1' && currentToken) {
          setToken(currentToken);
          try {
            const parsedUser = JSON.parse(localStorage.getItem('sa_user') || 'null');
            setUser(parsedUser);
          } catch {
            setUser(null);
          }
        } else {
          setToken('');
          setUser(null);
        }
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
