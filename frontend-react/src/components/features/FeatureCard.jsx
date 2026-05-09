import { motion } from 'framer-motion';

export default function FeatureCard({ icon, title, description, index }) {
  return (
    <motion.div
      className="feature-card"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{
        y: -6,
        borderColor: 'rgba(59, 130, 246, 0.2)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3), 0 0 30px rgba(59,130,246,0.08)',
      }}
    >
      <div className="feature-card__icon">{icon}</div>
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__desc">{description}</p>
    </motion.div>
  );
}
