import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import './StatsSection.css';

function useCounter(target, isVisible, duration = 2000, suffix = '') {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!isVisible || target === 0) return;
    let start = null;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isVisible, target, duration]);
  return value;
}

const STATS = [
  { value: 50000, suffix: '+', label: 'Applications Automated', color: 'blue' },
  { value: 12000, suffix: '+', label: 'Hours Saved', color: 'purple' },
  { value: 94, suffix: '%', label: 'Success Rate', color: 'blue' },
  { value: 2400, suffix: '+', label: 'Active Users', color: 'white' },
];

export default function StatsSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="stats" ref={ref}>
      <div className="stats__grid">
        {STATS.map((stat, i) => (
          <StatItem key={i} stat={stat} visible={visible} index={i} />
        ))}
      </div>
    </section>
  );
}

function StatItem({ stat, visible, index }) {
  const count = useCounter(stat.value, visible);

  return (
    <motion.div
      className="stats__item"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={`stats__value stats__value--${stat.color}`}>
        {count.toLocaleString()}{stat.suffix}
      </div>
      <div className="stats__label">{stat.label}</div>
    </motion.div>
  );
}
