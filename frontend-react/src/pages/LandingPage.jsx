import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';

function FAQItem({ question, answer }) {
  const handleToggle = (e) => e.currentTarget.classList.toggle('open');
  return (
    <div className="faq-item" onClick={handleToggle}>
      <div className="faq-question">
        <span>{question}</span>
        <i className="fa-solid fa-chevron-down faq-icon"></i>
      </div>
      <div className="faq-answer"><p>{answer}</p></div>
    </div>
  );
}

const FEATURES = [
  { icon: 'fa-robot', title: 'Auto-Apply Bot', desc: 'Our Chrome extension automatically fills and submits job applications on LinkedIn, saving you hours every day.' },
  { icon: 'fa-wand-magic-sparkles', title: 'AI Cover Letters', desc: 'Generate unique, tailored cover letters for each position using advanced AI.' },
  { icon: 'fa-chart-simple', title: 'ATS Resume Analyzer', desc: 'Score your resume against any job description. Get keyword matches and formatting tips.' },
  { icon: 'fa-linkedin', title: 'LinkedIn Optimizer', desc: 'Sync your LinkedIn profile and get AI-powered suggestions to boost recruiter visibility.' },
  { icon: 'fa-file-lines', title: 'Smart Resume Parser', desc: 'Upload your resume and we auto-extract all your details instantly.' },
  { icon: 'fa-shield-halved', title: 'Enterprise Security', desc: 'AES-256 encryption for credentials. Your data is stored securely.' },
];

const STEPS = [
  { num: '01', title: 'Create Your Profile', desc: 'Upload your resume or fill in your details. Our AI extracts everything automatically.' },
  { num: '02', title: 'Set Your Preferences', desc: 'Choose job titles, locations, experience levels, and filters.' },
  { num: '03', title: 'Let AI Apply For You', desc: 'Install our Chrome extension, hit Start, and watch SmartApply apply to matching jobs.' },
];

const FAQS = [
  { q: 'Is SmartApply free to use?', a: 'Yes! SmartApply is completely free. Create an account and start automating today.' },
  { q: 'How does the Chrome extension work?', a: 'It runs on LinkedIn Jobs pages, fills out Easy Apply forms using your profile data, and submits automatically.' },
  { q: 'Is my data secure?', a: 'All credentials are AES-256 encrypted. Your data is never shared with third parties.' },
  { q: 'What platforms are supported?', a: 'Currently LinkedIn Easy Apply. Support for Indeed and Glassdoor is coming soon.' },
  { q: 'Can I customize which jobs to apply for?', a: 'Yes! Set search terms, location, experience level, work mode, and keywords to skip.' },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const statsRef = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.querySelectorAll('[data-count]').forEach((el) => {
            const t = parseInt(el.dataset.count, 10);
            let c = 0; const s = Math.ceil(t / 40);
            const id = setInterval(() => { c = Math.min(c + s, t); el.textContent = c.toLocaleString() + (el.dataset.suffix || ''); if (c >= t) clearInterval(id); }, 30);
          });
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.3 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const authCTA = isAuthenticated
    ? <Link to="/dashboard" className="btn btn-primary btn-lg"><i className="fa-solid fa-gauge"></i> Go to Dashboard</Link>
    : <><Link to="/signup" className="btn btn-primary btn-lg magnetic"><i className="fa-solid fa-rocket"></i> Get Started Free</Link><a href="#features" className="btn btn-ghost btn-lg"><i className="fa-solid fa-play"></i> See How It Works</a></>;

  return (
    <>
      <div className="bg-grid"></div><div className="bg-glow bg-glow-1"></div><div className="bg-glow bg-glow-2"></div><div className="ambient-glow"></div>
      <Navbar variant="landing" />

      <section className="hero" id="hero"><div className="container"><div className="hero-content">
        <div className="hero-badge"><i className="fa-solid fa-bolt"></i> AI-Powered Job Applications</div>
        <h1>Stop Applying Manually.<br /><span className="gradient-text">Let AI Do It For You.</span></h1>
        <p className="hero-subtitle">SmartApply automates your entire job search — from finding positions to filling out applications and generating tailored cover letters.</p>
        <div className="hero-actions">{authCTA}</div>
      </div></div></section>

      <section className="section" ref={statsRef}><div className="container"><div className="stats-row reveal">
        {[['10000','+','Applications Sent'],['500','+','Happy Users'],['95','%','Success Rate'],['50','x','Faster Than Manual']].map(([c,s,l],i) => (
          <div className="stat-item" key={i}><div className="stat-number" data-count={c} data-suffix={s}>0</div><div className="stat-label">{l}</div></div>
        ))}
      </div></div></section>

      <section className="section" id="features"><div className="container">
        <div className="section-header reveal"><div className="section-badge"><i className="fa-solid fa-sparkles"></i> Features</div><h2>Everything You Need to Land Your Dream Job</h2><p className="section-subtitle">Powerful tools that automate every step of your job search</p></div>
        <div className="features-grid">{FEATURES.map((f,i) => <div className="feature-card reveal" key={i}><div className="feature-icon"><i className={`fa-solid ${f.icon}`}></i></div><h3>{f.title}</h3><p>{f.desc}</p></div>)}</div>
      </div></section>

      <section className="section" id="how-it-works"><div className="container">
        <div className="section-header reveal"><div className="section-badge"><i className="fa-solid fa-route"></i> How It Works</div><h2>3 Simple Steps to Automate Your Job Search</h2></div>
        <div className="steps-grid">{STEPS.map((s,i) => <div className="step-card reveal" key={i}><div className="step-num">{s.num}</div><h3>{s.title}</h3><p>{s.desc}</p></div>)}</div>
      </div></section>

      <section className="section" id="faq"><div className="container" style={{maxWidth:'720px'}}>
        <div className="section-header reveal"><div className="section-badge"><i className="fa-solid fa-circle-question"></i> FAQ</div><h2>Frequently Asked Questions</h2></div>
        <div className="faq-list reveal">{FAQS.map((f,i) => <FAQItem key={i} question={f.q} answer={f.a} />)}</div>
      </div></section>

      <section className="section cta-section"><div className="container" style={{textAlign:'center'}}><div className="reveal">
        <h2>Ready to Transform Your Job Search?</h2>
        <p className="section-subtitle" style={{marginBottom:'32px'}}>Join thousands landing interviews faster with SmartApply.</p>
        {isAuthenticated ? <Link to="/dashboard" className="btn btn-primary btn-lg"><i className="fa-solid fa-gauge"></i> Go to Dashboard</Link> : <Link to="/signup" className="btn btn-primary btn-lg magnetic"><i className="fa-solid fa-rocket"></i> Start Applying Free</Link>}
      </div></div></section>

      <footer className="footer"><div className="container">
        <div className="footer-content">
          <div className="footer-brand"><div className="nav-logo" style={{marginBottom:'12px'}}><div className="logo-dot"></div>Smart<span>Apply</span></div><p className="text-muted text-sm">AI-powered job application automation.</p></div>
          <div className="footer-links"><div><div className="footer-heading">Product</div><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#faq">FAQ</a></div><div><div className="footer-heading">Account</div><Link to="/login">Login</Link><Link to="/signup">Sign Up</Link></div></div>
        </div>
        <div className="footer-bottom"><p className="text-muted text-sm">© {new Date().getFullYear()} SmartApply. All rights reserved.</p></div>
      </div></footer>
    </>
  );
}
