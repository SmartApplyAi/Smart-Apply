import { motion, AnimatePresence } from 'framer-motion';
import './OrbLoader.css';

export default function OrbLoader({ isLoading }) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className="orb-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Ambient bloom */}
          <div className="orb-loader__ambient" />

          {/* Orb container */}
          <div className="orb-loader__orb">
            {/* Inner glow */}
            <div className="orb-loader__inner-glow" />

            {/* Glowing core */}
            <div className="orb-loader__core" />

            {/* Ring 1 — clockwise */}
            <div className="orb-loader__ring orb-loader__ring--1" />

            {/* Ring 2 — counter-clockwise */}
            <div className="orb-loader__ring orb-loader__ring--2" />
          </div>

          {/* Logo */}
          <div className="orb-loader__logo">
            <div className="orb-loader__logo-text">
              Smart<span>Apply</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
