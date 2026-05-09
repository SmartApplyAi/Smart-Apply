import { motion } from 'framer-motion';

const defaultVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    filter: 'blur(6px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function ScrollReveal({
  children,
  delay = 0,
  className = '',
  style = {},
  as = 'div',
}) {
  const Component = motion[as] || motion.div;

  return (
    <Component
      className={className}
      style={style}
      variants={defaultVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay }}
    >
      {children}
    </Component>
  );
}
