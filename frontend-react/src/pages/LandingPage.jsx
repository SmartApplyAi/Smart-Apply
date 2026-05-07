import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';

const PLATFORMS = [
  { name: 'LinkedIn', icon: 'fa-linkedin' },
  { name: 'Indeed', icon: 'fa-briefcase' },
  { name: 'Glassdoor', icon: 'fa-window-restore' },
  { name: 'Internshala', icon: 'fa-graduation-cap' },
  { name: 'Naukri', icon: 'fa-paper-plane' },
];

const FEATURES = [
  { icon: 'fa-robot', title: 'Auto-Apply Engine', desc: 'Our smart bot navigates complex forms and submits applications in seconds while you drink coffee.' },
  { icon: 'fa-wand-magic-sparkles', title: 'AI-Tailored Content', desc: 'Generate unique resumes and cover letters for every job description, boosting your interview rate by 3x.' },
  { icon: 'fa-chart-pie', title: 'Real-time Analytics', desc: 'Track every application, interview, and response in one beautiful, centralized dashboard.' },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="landing-root">
      <div className="ambient-glow"></div>
      <div className="blob" style={{ width: '600px', height: '600px', background: 'var(--primary)', top: '-10%', left: '-10%' }}></div>
      <div className="blob" style={{ width: '500px', height: '500px', background: 'var(--accent-5)', bottom: '-10%', right: '-10%', animationDelay: '-5s' }}></div>
      
      <Navbar variant="landing" />

      {/* ── Hero Section ── */}
      <section className="hero">
        <div className="container">
          <div className="hero-content reveal">
            <div className="hero-badge" style={{ display: 'inline-flex', padding: '8px 20px', background: 'rgba(0,113,227,0.1)', borderRadius: '99px', marginBottom: '24px', fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>
              <i className="fa-solid fa-sparkles" style={{ marginRight: '8px' }}></i> AI-Driven Career Growth
            </div>
            <h1>The Future of <span className="text-gradient-animate">Job Searching</span> is Here.</h1>
            <p style={{ fontSize: '20px', color: 'var(--text-2)', maxWidth: '700px', margin: '24px auto 40px', lineHeight: 1.6 }}>
              SmartApply automates the tedious parts of your job search. Apply to hundreds of jobs with one click, perfectly tailored every time.
            </p>
            <div className="hero-actions" style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn btn-primary btn-lg">Go to Dashboard</Link>
              ) : (
                <>
                  <Link to="/signup" className="btn btn-primary btn-lg">Start Applying Free</Link>
                  <a href="#features" className="btn" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>See Features</a>
                </>
              )}
            </div>
          </div>

          <div className="hero-visual-wrap reveal" style={{ animationDelay: '0.4s' }}>
            <div className="hero-visual">
              <img 
                src="hero_dashboard_mockup_1778172017030.png" 
                alt="SmartApply Dashboard Mockup" 
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee Section ── */}
      <section className="platforms-marquee">
        <div className="container">
          <p style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-3)', marginBottom: '32px' }}>Supported Platforms</p>
          <div className="marquee-wrapper">
            <div className="marquee-content">
              {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                <div key={i} className="platform-item">
                  <i className={`fa-brands ${p.icon} fa-lg`}></i>
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="section" id="features">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '80px' }} className="reveal">
            <h2 style={{ marginBottom: '16px' }}>Built for the Modern Job Seeker</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '18px' }}>Powerful features that give you an unfair advantage.</p>
          </div>
          <div className="grid-3 stagger">
            {FEATURES.map((f, i) => (
              <div key={i} className="card reveal">
                <div style={{ width: '56px', height: '56px', background: 'rgba(0,113,227,0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--primary)', marginBottom: '24px' }}>
                  <i className={`fa-solid ${f.icon}`}></i>
                </div>
                <h3 style={{ marginBottom: '12px' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Section ── */}
      <section className="section" style={{ background: 'var(--bg-3)' }}>
        <div className="container">
          <div className="grid-3 stagger">
            {[
              { val: '50,000+', label: 'Applications Sent' },
              { val: '12,000+', label: 'Interviews Landed' },
              { val: '98%', label: 'User Satisfaction' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }} className="reveal">
                <div className="stat-count" style={{ fontSize: '48px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'Outfit' }}>{s.val}</div>
                <div style={{ fontWeight: 600, color: 'var(--text-3)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '13px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="section">
        <div className="container">
          <div className="card reveal" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-5) 100%)', border: 'none', textAlign: 'center', padding: '80px 40px' }}>
            <h2 style={{ color: '#fff', marginBottom: '24px' }}>Stop Wasting Time on Applications.</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '20px', maxWidth: '600px', margin: '0 auto 40px' }}>
              Join 10,000+ users who have automated their job search and landed their dream roles faster than ever.
            </p>
            <Link to="/signup" className="btn" style={{ background: '#fff', color: 'var(--primary)', padding: '20px 48px', fontSize: '18px' }}>
              Get Started for Free <i className="fa-solid fa-arrow-right" style={{ marginLeft: '12px' }}></i>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: '60px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <div className="container">
          <div className="nav-logo" style={{ marginBottom: '24px', fontSize: '24px' }}>Smart<span>Apply</span></div>
          <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>© {new Date().getFullYear()} SmartApply Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
