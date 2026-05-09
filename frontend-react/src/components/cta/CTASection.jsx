import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import './CTASection.css';

export default function CTASection() {
  return (
    <section className="cta">
      <motion.div
        className="cta__inner"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Rotating gradient glow */}
        <div className="cta__glow" />

        {/* Background orbs */}
        <div className="cta__orb cta__orb--1" />
        <div className="cta__orb cta__orb--2" />

        <div className="cta__content">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              marginBottom: 24,
              color: '#3B82F6',
            }}
          >
            <Sparkles size={24} />
          </motion.div>

          <h2 className="cta__title">
            Ready to automate your job search?
          </h2>
          <p className="cta__desc">
            Join thousands of candidates who are landing interviews faster with AI-powered automation.
          </p>
          <Link to="/signup" className="cta__button">
            Create Your Free Account <ArrowRight size={18} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
