import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import ScrollReveal from '../effects/ScrollReveal';
import './ContactSection.css';

export default function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // Placeholder — integrate with backend later
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <section className="contact" id="contact">
      <SectionHeading
        label="Get in Touch"
        title="We're here to help"
        description="Questions or feedback? Send us a message and we'll get back to you shortly."
      />

      <ScrollReveal>
        <div className="contact__wrapper">
          <div className="contact__form-card">
            <form className="contact__form" onSubmit={handleSubmit}>
              <div className="contact__field">
                <label className="contact__label">Name</label>
                <input
                  className="contact__input"
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={handleChange('name')}
                  required
                />
              </div>

              <div className="contact__field">
                <label className="contact__label">Email</label>
                <input
                  className="contact__input"
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={handleChange('email')}
                  required
                />
              </div>

              <div className="contact__field">
                <label className="contact__label">Message</label>
                <textarea
                  className="contact__textarea"
                  placeholder="How can we help?"
                  value={form.message}
                  onChange={handleChange('message')}
                  rows={4}
                  required
                />
              </div>

              <motion.button
                type="submit"
                className="contact__submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {submitted ? '✓ Message Sent!' : (
                  <>Send Message <Send size={14} style={{ marginLeft: 6, display: 'inline' }} /></>
                )}
              </motion.button>
            </form>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
