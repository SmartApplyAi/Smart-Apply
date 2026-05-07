import { useState } from 'react';

export default function LoadingButton({
  children,
  onClick,
  loading: controlledLoading,
  className = 'btn btn-primary',
  type = 'button',
  disabled = false,
  id,
  style,
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = controlledLoading !== undefined ? controlledLoading : internalLoading;

  const handleClick = async (e) => {
    if (!onClick || isLoading) return;
    if (controlledLoading === undefined) {
      setInternalLoading(true);
      try { await onClick(e); }
      finally { setInternalLoading(false); }
    } else {
      onClick(e);
    }
  };

  return (
    <button
      type={type}
      className={`${className}${isLoading ? ' loading' : ''}`}
      onClick={type === 'button' ? handleClick : undefined}
      disabled={disabled || isLoading}
      id={id}
      style={style}
    >
      <span className="spinner" style={{ display: isLoading ? 'inline-block' : 'none' }}></span>
      <span className="btn-text" style={{ display: isLoading ? 'none' : 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {children}
      </span>
    </button>
  );
}
