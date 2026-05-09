import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function PrimaryButton({
  children,
  to,
  href,
  onClick,
  variant = 'primary', // 'primary' | 'outline' | 'ghost'
  size = 'md',         // 'sm' | 'md' | 'lg'
  icon,
  className = '',
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '8px 18px', fontSize: '13px' },
    md: { padding: '12px 28px', fontSize: '15px' },
    lg: { padding: '16px 36px', fontSize: '16px' },
  };

  const variants = {
    primary: {
      background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
      color: '#fff',
      border: 'none',
      boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)',
    },
    outline: {
      background: 'transparent',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: 'none',
    },
    ghost: {
      background: 'rgba(255,255,255,0.05)',
      color: '#A1A1AA',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'none',
    },
  };

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '12px',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ...sizes[size],
    ...variants[variant],
    ...style,
  };

  const hoverEffect = {
    scale: 1.03,
    boxShadow: variant === 'primary'
      ? '0 8px 32px rgba(59, 130, 246, 0.45)'
      : '0 4px 16px rgba(255,255,255,0.08)',
  };

  const tapEffect = { scale: 0.97 };

  const motionProps = {
    className,
    style: baseStyle,
    whileHover: hoverEffect,
    whileTap: tapEffect,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
    ...rest,
  };

  if (to) {
    return (
      <motion.div {...motionProps}>
        <Link to={to} style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon}
          {children}
        </Link>
      </motion.div>
    );
  }

  if (href) {
    return (
      <motion.a href={href} {...motionProps}>
        {icon}
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button onClick={onClick} {...motionProps}>
      {icon}
      {children}
    </motion.button>
  );
}
