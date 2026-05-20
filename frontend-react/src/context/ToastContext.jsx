import { createContext, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const showToast = useCallback((message, type = 'info', duration) => {
    const finalDuration = duration || (type === 'error' ? 8000 : 4000);
    const opts = {
      duration: finalDuration,
      style: {
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm, 12px)',
        fontSize: '14px',
        fontFamily: '"DM Sans", sans-serif',
        boxShadow: 'var(--shadow-lg)',
        padding: '12px 16px',
      },
    };
    switch (type) {
      case 'success':
        toast.success(message, opts);
        break;
      case 'error':
        toast.error(message, opts);
        break;
      default:
        toast(message, {
          ...opts,
          icon: type === 'info' ? 'ℹ️' : undefined,
        });
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </ToastContext.Provider>
  );
}
