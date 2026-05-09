import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import ScrollReveal from '../effects/ScrollReveal';
import './FAQSection.css';

const FAQ_DATA = [
  {
    q: 'Is SmartApply safe to use?',
    a: 'Absolutely. Your data is encrypted end-to-end and stored securely. We never share your information with third parties. The extension runs locally in your browser with minimal permissions.',
  },
  {
    q: 'Does it support LinkedIn?',
    a: 'Yes! SmartApply currently supports LinkedIn Easy Apply. Our Chrome extension navigates LinkedIn, finds matching jobs, and fills out every form field using your saved resume and AI-generated answers.',
  },
  {
    q: 'Can I customize my applications?',
    a: 'Yes. You can set filters for salary, role, location, and remote status. Our AI also tailors cover letters and answers unique questions based on each job description.',
  },
  {
    q: 'Does it work globally?',
    a: 'SmartApply works with LinkedIn Easy Apply worldwide. As long as the job posting uses LinkedIn Easy Apply, our extension can automate the application process regardless of location.',
  },
  {
    q: 'Do I need to keep my browser open?',
    a: 'Yes, the extension runs in your active Chrome tab. You can minimize the window, but the tab must remain open for automation to continue running.',
  },
];

function FaqItem({ item, isOpen, toggle, index }) {
  return (
    <ScrollReveal delay={index * 0.08}>
      <div className={`faq__item ${isOpen ? 'faq__item--open' : ''}`}>
        <button className="faq__question" onClick={toggle}>
          <span>{item.q}</span>
          <span className={`faq__icon ${isOpen ? 'faq__icon--open' : ''}`}>
            <ChevronDown size={16} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              className="faq__answer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="faq__answer-text">{item.a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollReveal>
  );
}

export default function FAQSection() {
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <section className="faq" id="faq">
      <SectionHeading
        label="FAQ"
        title="Frequently Asked Questions"
        description="Everything you need to know about SmartApply."
      />
      <div className="faq__list">
        {FAQ_DATA.map((item, i) => (
          <FaqItem
            key={i}
            item={item}
            isOpen={openIdx === i}
            toggle={() => setOpenIdx(openIdx === i ? null : i)}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
