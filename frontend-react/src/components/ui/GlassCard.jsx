import { motion } from 'framer-motion';

export default function GlassCard({
  children,
  className = '',
  style = {},
  hoverLift = true,
  glowColor = 'rgba(59,130,246,0.15)',
  padding = '32px',
  ...rest
}) {
  const baseStyle = {
    position: 'relative',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    padding,
    overflow: 'hidden',
    ...style,
  };

  return (
    <motion.div
      className={className}
      style={baseStyle}
      whileHover={hoverLift ? {
        y: -8,
        borderColor: 'rgba(255,255,255,0.12)',
        boxShadow: `0 20px 40px rgba(0,0,0,0.3), 0 0 40px ${glowColor}`,
      } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
