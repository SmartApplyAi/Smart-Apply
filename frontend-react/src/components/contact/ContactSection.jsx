import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import ScrollReveal from '../effects/ScrollReveal';
import './ContactSection.css';

/*
 * Google Sheets Integration via Google Apps Script Web App
 * ────────────────────────────────────────────────────────
 * To set up:
 * 1. Create a Google Sheet with columns: Timestamp | Name | Email | Message
 * 2. Open Extensions → Apps Script
 * 3. Paste this code:
 *
 *    function doPost(e) {
 *      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *      const data = JSON.parse(e.postData.contents);
 *      sheet.appendRow([
 *        new Date().toISOString(),
 *        data.name,
 *        data.email,
 *        data.message
 *      ]);
 *      return ContentService
 *        .createTextOutput(JSON.stringify({ status: 'success' }))
 *        .setMimeType(ContentService.MimeType.JSON);
 *    }
 *
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL and paste it below
 */

const GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec';

export default function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | success | error

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;

    setStatus('sending');

    try {
      const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requires no-cors
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.message.trim(),
        }),
      });

      // no-cors mode always returns opaque response, so we assume success
      setStatus('success');
      setForm({ name: '', email: '', message: '' });

      // Reset status after 4 seconds
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      console.error('Failed to submit contact form:', err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const isDisabled = status === 'sending' || status === 'success';

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
                  disabled={isDisabled}
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
                  disabled={isDisabled}
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
                  disabled={isDisabled}
                  required
                />
              </div>

              <motion.button
                type="submit"
                className={`contact__submit contact__submit--${status}`}
                whileHover={!isDisabled ? { scale: 1.02 } : {}}
                whileTap={!isDisabled ? { scale: 0.98 } : {}}
                disabled={isDisabled}
              >
                <AnimatePresence mode="wait">
                  {status === 'idle' && (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="contact__submit-inner"
                    >
                      Send Message <Send size={14} style={{ marginLeft: 6 }} />
                    </motion.span>
                  )}
                  {status === 'sending' && (
                    <motion.span
                      key="sending"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="contact__submit-inner"
                    >
                      <Loader2 size={16} className="contact__spinner" style={{ marginRight: 8 }} />
                      Sending...
                    </motion.span>
                  )}
                  {status === 'success' && (
                    <motion.span
                      key="success"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="contact__submit-inner"
                    >
                      <CheckCircle size={16} style={{ marginRight: 8 }} />
                      Message Sent!
                    </motion.span>
                  )}
                  {status === 'error' && (
                    <motion.span
                      key="error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="contact__submit-inner"
                    >
                      <AlertCircle size={16} style={{ marginRight: 8 }} />
                      Failed — try again
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </form>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
