import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import FloatingGlow from '../effects/FloatingGlow';
import './HeroSection.css';

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 40, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function HeroSection() {
  return (
    <section className="hero">
      <FloatingGlow color="rgba(59,130,246,0.08)" size={600} top="-10%" left="10%" blur={100} />
      <FloatingGlow color="rgba(139,92,246,0.06)" size={400} top="20%" right="5%" blur={80} />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        {/* Badge */}
        <motion.div variants={fadeUp} className="hero__badge">
          <span className="hero__badge-dot" />
          Powered by AI · v2.0
        </motion.div>

        {/* Title */}
        <motion.h1 variants={fadeUp} className="hero__title">
          Automate your{' '}
          <span className="hero__title-accent">job search</span>
          .<br />
          Maximize your opportunities.
        </motion.h1>

        {/* Subtitle */}
        <motion.p variants={fadeUp} className="hero__subtitle">
          SmartApply's AI engine handles LinkedIn Easy Apply, cover letters, and ATS
          matching — so you get interviews, not fatigue.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={fadeUp} className="hero__ctas">
          <Link
            to="/signup"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 32px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
              borderRadius: '12px',
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
              transition: 'all 0.3s ease',
            }}
          >
            Start for free <ArrowRight size={16} />
          </Link>
          <a
            href="#how-it-works"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 28px',
              fontSize: '15px',
              fontWeight: 500,
              color: '#A1A1AA',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
            }}
          >
            <Play size={14} /> See how it works
          </a>
        </motion.div>

        {/* Dashboard Mockup */}
        <motion.div
          variants={fadeUp}
          className="hero__mockup-wrapper"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="hero__mockup-glow" />
          <div className="hero__mockup">
            {/* Browser bar */}
            <div className="hero__mockup-bar">
              <span className="hero__mockup-dot" style={{ background: '#FF5F56' }} />
              <span className="hero__mockup-dot" style={{ background: '#FFBD2E' }} />
              <span className="hero__mockup-dot" style={{ background: '#27C93F' }} />
              <span
                style={{
                  marginLeft: '12px',
                  padding: '4px 16px',
                  fontSize: '11px',
                  color: '#52525B',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                app.smartapply.ai/dashboard
              </span>
            </div>

            {/* Content */}
            <div className="hero__mockup-content">
              <div className="hero__mockup-card">
                <div className="hero__mockup-label">Total Applications</div>
                <div className="hero__mockup-value">1,247</div>
                <div className="hero__mockup-meta" style={{ color: '#22C55E' }}>
                  ✓ 98.2% success rate
                </div>
              </div>
              <div className="hero__mockup-card">
                <div className="hero__mockup-label">Interviews Landed</div>
                <div className="hero__mockup-value">89</div>
                <div className="hero__mockup-meta" style={{ color: '#3B82F6' }}>
                  ↑ 32% this month
                </div>
              </div>
              <div className="hero__mockup-card">
                <div className="hero__mockup-label">Hours Saved</div>
                <div className="hero__mockup-value">340+</div>
                <div className="hero__mockup-meta" style={{ color: '#8B5CF6' }}>
                  ◈ AI-automated
                </div>
              </div>
              <div className="hero__mockup-card">
                <div className="hero__mockup-label">Active Campaigns</div>
                <div className="hero__mockup-value">5</div>
                <div className="hero__mockup-meta" style={{ color: '#F59E0B' }}>
                  ● Running now
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
