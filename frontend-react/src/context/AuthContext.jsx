import { createContext, useState, useCallback, useEffect } from 'react';
import { authStore } from '../auth/authStore';
import { refreshManager } from '../auth/refreshManager';
import api from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'
  const [user, setUser] = useState(null);

  // Use a broadcast channel for multi-tab logout/login sync
  useEffect(() => {
    const channel = new BroadcastChannel('auth_sync');
    channel.onmessage = (event) => {
      if (event.data.type === 'LOGOUT') {
        authStore.clear();
        setAuthState('unauthenticated');
        setUser(null);
        window.location.href = '/login';
      }
    };
    return () => channel.close();
  }, []);

  // Global event listener for Axios 401 unrecoverable failures
  useEffect(() => {
    const handleForceLogout = () => {
      authStore.clear();
      setAuthState('unauthenticated');
      setUser(null);
      window.location.href = '/login';
    };
    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
  }, []);

  const bootstrapAuth = useCallback(async () => {
    try {
      setAuthState('loading');
      // Attempt silent refresh
      const data = await refreshManager.refresh();
      setUser(data.user);
      setAuthState('authenticated');
    } catch {
      // Refresh failed (no cookie, or expired cookie)
      setAuthState('unauthenticated');
      setUser(null);
    }
  }, []);

  // Run on mount with safe deferred timeout to prevent cascading renders
  useEffect(() => {
    const timer = setTimeout(() => {
      bootstrapAuth();
    }, 0);
    return () => clearTimeout(timer);
  }, [bootstrapAuth]);

  const save = useCallback((newToken, newUser) => {
    authStore.setToken(newToken);
    setUser(newUser);
    setAuthState('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // ignore
    }
    authStore.clear();
    setAuthState('unauthenticated');
    setUser(null);

    const channel = new BroadcastChannel('auth_sync');
    channel.postMessage({ type: 'LOGOUT' });
    channel.close();

    window.location.href = '/login';
  }, []);

  const clear = useCallback(() => {
    authStore.clear();
    setAuthState('unauthenticated');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authState, isAuthenticated: authState === 'authenticated', save, logout, clear }}>
      {children}
    </AuthContext.Provider>
  );
}
