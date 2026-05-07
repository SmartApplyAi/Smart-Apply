import { createContext, useContext, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const opts = {
      duration,
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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default ToastContext;
