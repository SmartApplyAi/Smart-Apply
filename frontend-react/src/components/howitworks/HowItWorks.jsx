import { motion } from 'framer-motion';
import { Upload, Settings, Zap } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import './HowItWorks.css';

const STEPS = [
  {
    icon: <Upload size={24} />,
    number: '01',
    title: 'Upload Resume',
    desc: 'Upload your PDF resume and our AI extracts all your skills, experience, and education.',
  },
  {
    icon: <Settings size={24} />,
    number: '02',
    title: 'Configure Preferences',
    desc: 'Set your target roles, locations, salary range, and job type filters.',
  },
  {
    icon: <Zap size={24} />,
    number: '03',
    title: 'Auto Apply with AI',
    desc: 'Sit back while our AI applies to matching jobs on LinkedIn automatically.',
  },
];

export default function HowItWorks() {
  return (
    <section className="hiw" id="how-it-works">
      <SectionHeading
        label="How it Works"
        title="Three steps to automate your job search"
        description="Get started in minutes. No complicated setup required."
      />

      <div className="hiw__steps">
        {STEPS.map((step, i) => (
          <motion.div
            key={i}
            className="hiw__step"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className="hiw__connector">
                <motion.div
                  className="hiw__connector-line"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}

            <div className="hiw__step-number">
              <span className="hiw__step-icon">{step.icon}</span>
            </div>
            <h3 className="hiw__step-title">{step.title}</h3>
            <p className="hiw__step-desc">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
