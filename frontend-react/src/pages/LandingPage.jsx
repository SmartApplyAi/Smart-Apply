import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <div className="landing-root">
      <Navbar variant="landing" />

      {/* ── Hero ── */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-badge" style={{ display: 'inline-block', padding: '6px 16px', border: '1px solid var(--border)', borderRadius: '99px', fontSize: '12px', color: 'var(--text-3)', marginBottom: '32px' }}>
              ● POWERED BY AI — v1.0
            </div>
            <h1>Automate your<br /><span>job search</span>.<br />Maximize your<br />opportunities.</h1>
            <p>SmartApply's AI engine handles your LinkedIn Easy Apply, cover letters, and ATS matching — so you get interviews, not fatigue.</p>
            <div className="hero-actions">
              <Link to="/signup" className="btn btn-primary"><i className="fa-solid fa-bolt"></i> Start for free</Link>
              <Link to="/login" className="btn btn-outline">Get started free <i className="fa-solid fa-arrow-right"></i></Link>
            </div>
          </div>

          <div className="mockup-window">
            <div className="mockup-header">
              <div className="dot red"></div>
              <div className="dot yellow"></div>
              <div className="dot green"></div>
            </div>
            <div className="mockup-body">
              <div className="mockup-card">
                <div className="label">Total Applications</div>
                <div className="value">0</div>
                <div style={{ fontSize: '12px', color: '#27c93f', marginTop: '8px' }}>● 100% success tracking</div>
              </div>
              <div className="mockup-card">
                <div className="label">Interviews Landed</div>
                <div className="value">0</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>● Waiting for first apply</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="number">+</div>
              <div className="label">Leading platform</div>
            </div>
            <div className="stat-item">
              <div className="number">2,400+</div>
              <div className="label">Users daily</div>
            </div>
            <div className="stat-item">
              <div className="number">68%</div>
              <div className="label">Avg interview rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-header">
            <div style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>Features</div>
            <h2>Everything you need to land your next job</h2>
            <p>SmartApply handles the repetitive work while you focus on interview prep.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: 'fa-file-lines', title: 'Smart Resume Parsing', desc: 'Upload your PDF resume and our AI automatically extracts skills, experience, and education for all platforms.' },
              { icon: 'fa-chrome', title: 'Chrome Extension Bot', desc: 'The powerful browser extension goes to LinkedIn, finds the Apply button, and fills the entire form for you.' },
              { icon: 'fa-filter', title: 'Smart Filtering', desc: 'Only apply to jobs that match your criteria. Filter by salary, role, location, and remote status.' },
              { icon: 'fa-chart-line', title: 'Application Tracking', desc: 'Never lose track of where you applied. Every submission is logged with status updates and links.' },
              { icon: 'fa-brain', title: 'AI-Powered Answers', desc: 'Standard forms are easy. Our AI handles the unique questions like "Why do you want to work here?"' },
              { icon: 'fa-magnifying-glass', title: 'ATS Resume Analyzer', desc: 'Scan your resume against job descriptions to see how well you score before applying.' },
            ].map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon"><i className={`fa-solid ${f.icon}`}></i></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Marquee ── */}
      <section className="marquee">
        <div className="marquee-content">
          {[
            { n: 'LinkedIn', i: 'fa-linkedin' },
            { n: 'Indeed', i: 'fa-briefcase' },
            { n: 'Glassdoor', i: 'fa-window-restore' },
            { n: 'Internshala', i: 'fa-graduation-cap' },
            { n: 'Naukri', i: 'fa-paper-plane' },
            { n: 'Google Jobs', i: 'fa-google' },
          ].concat([
            { n: 'LinkedIn', i: 'fa-linkedin' },
            { n: 'Indeed', i: 'fa-briefcase' },
            { n: 'Glassdoor', i: 'fa-window-restore' },
            { n: 'Internshala', i: 'fa-graduation-cap' },
            { n: 'Naukri', i: 'fa-paper-plane' },
            { n: 'Google Jobs', i: 'fa-google' },
          ]).map((p, i) => (
            <div key={i} className="platform-item">
              <i className={`fa-brands ${p.i}`}></i> {p.n}
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>FAQ</div>
            <h2>Frequently Asked Questions</h2>
          </div>
          <div className="faq-list">
            {[
              'How does the auto-apply work?',
              'Is my data safe and private?',
              'Do I need to leave my browser open?',
              'Which platforms are supported?',
            ].map((q, i) => (
              <div key={i} className={`faq-item ${openFaq === i ? 'open' : ''}`}>
                <button className="faq-question" onClick={() => toggleFaq(i)}>
                  {q} <i className={`fa-solid fa-plus ${openFaq === i ? 'fa-rotate-45' : ''}`}></i>
                </button>
                <div className="faq-answer">
                  SmartApply uses advanced browser automation and AI to simulate human behavior while filling forms. Your data is encrypted and never shared. Yes, the extension runs while the tab is open.
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>Get in touch</div>
            <h2>We're here to help</h2>
            <p>Questions or feedback? Send us a message.</p>
          </div>
          <div className="contact-card">
            <form>
              <div className="form-group">
                <label>Name</label>
                <input type="text" placeholder="Your name" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Your email address" />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea rows="4" placeholder="How can we help?"></textarea>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <i className="fa-solid fa-paper-plane"></i> Send Message
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="container">
        <div className="final-cta">
          <h2>Ready to automate your job search?</h2>
          <p>Join thousands of candidates successfully landing jobs with AI.</p>
          <Link to="/signup" className="btn btn-outline" style={{ background: 'rgba(255,255,255,0.2)', padding: '16px 40px', fontSize: '18px' }}>
            Create Your Free Account
          </Link>
        </div>
      </section>

      <footer>
        <div className="container">
          <p>© {new Date().getFullYear()} SmartApply. All rights reserved.</p>
          <div style={{ marginTop: '12px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <a href="#">Terms</a> <a href="#">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
