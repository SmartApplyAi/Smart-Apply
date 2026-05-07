import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('sa_theme') || 'auto');

  const applyTheme = useCallback((themeVal) => {
    let finalTheme = themeVal;
    if (themeVal === 'auto') {
      finalTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', finalTheme);
  }, []);

  const setTheme = useCallback((mode) => {
    localStorage.setItem('sa_theme', mode);
    setThemeState(mode);
    applyTheme(mode);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: mode } }));
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const current = theme;
    let next = 'dark';
    if (current === 'dark') next = 'light';
    else if (current === 'light') next = 'dark';
    else {
      const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      next = isDark ? 'light' : 'dark';
    }
    setTheme(next);
  }, [theme, setTheme]);

  // Apply on mount and when theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Listen for OS preference changes when in auto mode
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => {
      if (theme === 'auto') applyTheme('auto');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export default ThemeContext;
