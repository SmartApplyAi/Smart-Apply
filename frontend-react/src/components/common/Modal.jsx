import { useEffect } from 'react';

export default function Modal({ open, onClose, children, maxWidth = '560px' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && open && onClose) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', animation: 'fadeIn 0.22s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: 'var(--glass-bg)', border: '1px solid var(--border)',
          borderRadius: '24px', padding: 'clamp(24px, 5vw, 40px)',
          width: '100%', maxWidth, maxHeight: '85vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeIn 0.25s cubic-bezier(.2,.8,.3,1.1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
