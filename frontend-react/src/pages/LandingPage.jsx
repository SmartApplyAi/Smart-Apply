import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";

/* ─── Custom Hooks ─── */

function useReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, isVisible];
}

function useCounter(target, isVisible, duration = 1500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!isVisible || target === 0) return;
    let start = null;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isVisible, target, duration]);
  return value;
}

/* ─── Style & Font Injection ─── */

function useInjectStyles() {
  useEffect(() => {
    // Font
    if (!document.getElementById("sa-landing-font")) {
      const link = document.createElement("link");
      link.id = "sa-landing-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800;1,900&display=swap";
      document.head.appendChild(link);
    }
    // Keyframes
    if (!document.getElementById("sa-landing-kf")) {
      const style = document.createElement("style");
      style.id = "sa-landing-kf";
      style.textContent = `
@keyframes fadeUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes heroPulse{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.18)}50%{box-shadow:0 0 0 12px rgba(59,130,246,0)}}
`;
      document.head.appendChild(style);
    }
  }, []);
}

/* ─── Sub-Components ─── */

function TopBar() {
  return (
    <div style={{ textAlign: "center", padding: "14px 0 0", fontSize: "0.72rem", color: "#6b7280", letterSpacing: "0.06em", fontFamily: "Inter,sans-serif" }}>
      ✦ POWERED BY AI — v1.0
    </div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  const bg = scrolled ? "rgba(0,0,0,0.92)" : "transparent";
  const blur = scrolled ? "blur(12px)" : "none";
  const border = scrolled ? "1px solid #111" : "1px solid transparent";
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: bg, backdropFilter: blur, WebkitBackdropFilter: blur, borderBottom: border, transition: "all 0.35s ease", animation: "fadeDown 0.5s ease", fontFamily: "Inter,sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          <span style={{ color: "#3b82f6", marginRight: 2 }}>·</span>
          <span style={{ color: "#fff", fontWeight: 400 }}>Smart</span>
          <span style={{ color: "#3b82f6", fontWeight: 700 }}>Apply</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#features" style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "color 0.2s" }}>Features</a>
          <a href="#how-it-works" style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "color 0.2s" }}>How it Works</a>
          <Link to="/login" style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>Login</Link>
          <Link to="/signup" style={{ background: "#3b82f6", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "background 0.2s" }}>Get Started</Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const [ref, vis] = useReveal(0.05);
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "80px 24px 60px", background: "#000", fontFamily: "Inter,sans-serif" }}>
      <h1 style={{ fontSize: "clamp(2.8rem,6vw,5rem)", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.03em", color: "#fff", marginBottom: 28, maxWidth: 720 }}>
        Automate your<br />
        <span style={{ color: "#3b82f6", fontStyle: "italic", fontWeight: 800 }}>job search</span>
        <span style={{ color: "#fff" }}>.</span><br />
        Maximize your<br />
        opportunities.
      </h1>
      <p style={{ color: "#9ca3af", fontSize: "1rem", maxWidth: 480, margin: "0 auto 36px", lineHeight: 1.65 }}>
        {"SmartApply\u2019s AI engine handles your LinkedIn Easy Apply, cover letters, and ATS matching \u2014 so you get interviews, not fatigue."}
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 56 }}>
        <Link to="/signup" style={{ background: "#3b82f6", color: "#fff", padding: "10px 24px", borderRadius: 6, fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "background 0.2s" }}>Start for free</Link>
        <Link to="/signup" style={{ color: "#fff", padding: "10px 24px", fontSize: 15, fontWeight: 500, textDecoration: "none", background: "transparent" }}>Get started free</Link>
      </div>
      {/* Dashboard Mock */}
      <div ref={ref} style={{ width: "100%", maxWidth: 780, background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: 24, opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(32px)", transition: "all 0.8s ease" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f", display: "inline-block" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: 16, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>TOTAL APPLICATIONS</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontFamily: "Inter" }}>0</div>
            <div style={{ fontSize: 12, color: "#22c55e", marginTop: 8 }}>{"\u2713 100% success tracking"}</div>
          </div>
          <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: 16, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>INTERVIEWS LANDED</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontFamily: "Inter" }}>0</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>{"\u25cf Waiting for first apply"}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const [ref, vis] = useReveal(0.15);
  const users = useCounter(2400, vis);
  const rate = useCounter(68, vis);
  return (
    <section ref={ref} style={{ padding: "60px 24px", fontFamily: "Inter,sans-serif", opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(32px)", transition: "all 0.7s ease" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center", gap: 24 }}>
        <div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#fff" }}>+</div>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>LEADING PLATFORM</div>
        </div>
        <div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#3b82f6" }}>{users.toLocaleString()}+</div>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>USERS DAILY</div>
        </div>
        <div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#3b82f6" }}>{rate}%</div>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>AVG INTERVIEW RATE</div>
        </div>
      </div>
    </section>
  );
}

/* ─── Icons ─── */

const Icons = {
  Bot: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4M8 16v.01M16 16v.01" />
    </svg>
  ),
  FileText: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  Filter: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  ClipboardList: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
    </svg>
  ),
  Zap: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Search: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
};

const FEATURES = [
  { icon: <Icons.FileText />, title: "Smart Resume Parsing", desc: "Upload your PDF resume and our AI automatically extracts skills, experience, and education for all platforms." },
  { icon: <Icons.Bot />, title: "Chrome Extension Bot", desc: "The powerful browser extension goes to LinkedIn, finds the Apply button, and fills the entire form for you." },
  { icon: <Icons.Filter />, title: "Smart Filtering", desc: "Only apply to jobs that match your criteria. Filter by salary, role, location, and remote status." },
  { icon: <Icons.ClipboardList />, title: "Application Tracking", desc: "Never lose track of where you applied. Every submission is logged with status updates and links." },
  { icon: <Icons.Zap />, title: "AI-Powered Answers", desc: "Standard forms are easy. Our AI handles the unique questions like \u201cWhy do you want to work here?\u201d" },
  { icon: <Icons.Search />, title: "ATS Resume Analyzer", desc: "Scan your resume against job descriptions to see how well you score before applying." },
];

function Features() {
  return (
    <section id="features" style={{ padding: "80px 24px", fontFamily: "Inter,sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>FEATURES</div>
          <h2 style={{ color: "#fff", fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 700, marginBottom: 14 }}>Everything you need to land your next job</h2>
          <p style={{ color: "#6b7280", maxWidth: 540, margin: "0 auto" }}>SmartApply handles the repetitive work while you focus on interview prep.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 20 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={i} f={f} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ f, delay }) {
  const [ref, vis] = useReveal(0.1);
  const [hov, setHov] = useState(false);
  return (
    <div ref={ref}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "#161616" : "#0d0d0d",
        border: `1px solid ${hov ? "#333" : "#1e1e1e"}`,
        borderRadius: 16, padding: "32px",
        transform: vis ? (hov ? "translateY(-6px)" : "translateY(0)") : "translateY(32px)",
        opacity: vis ? 1 : 0,
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${delay}s`,
        cursor: "default"
      }}>
      <div style={{ color: "#3b82f6", marginBottom: 20, display: "inline-block" }}>{f.icon}</div>
      <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{f.title}</h3>
      <p style={{ color: "#9ca3af", fontSize: 15, lineHeight: 1.6 }}>{f.desc}</p>
    </div>
  );
}

const PLATFORMS = ["Naukri", "Internshala", "Google Jobs", "LinkedIn", "Indeed", "Glassdoor", "Internshala", "Google Jobs"];

function Marquee() {
  const items = [...PLATFORMS, ...PLATFORMS];
  return (
    <section style={{ overflow: "hidden", padding: "40px 0", position: "relative", fontFamily: "Inter,sans-serif" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to right,#000,transparent)", zIndex: 2 }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to left,#000,transparent)", zIndex: 2 }} />
      <div style={{ display: "flex", gap: 60, width: "max-content", animation: "marquee 30s linear infinite" }}>
        {items.map((p, i) => (
          <span key={i} style={{ color: "#6b7280", fontSize: "0.9rem", fontWeight: 500, whiteSpace: "nowrap" }}>{p}</span>
        ))}
      </div>
    </section>
  );
}

const FAQ_DATA = [
  { q: "How does the auto-apply work?", a: "SmartApply uses a Chrome extension that navigates LinkedIn, finds Easy Apply jobs matching your filters, and fills out every form field using your saved resume and AI-generated answers." },
  { q: "Is my data safe and private?", a: "Absolutely. Your data is encrypted end-to-end and stored securely. We never share your information with third parties." },
  { q: "Do I need to leave my browser open?", a: "Yes, the extension runs in your active Chrome tab. You can minimize the window, but the tab must remain open for automation to continue." },
  { q: "Which platforms are supported?", a: "Currently we support LinkedIn Easy Apply. Support for Indeed, Glassdoor, Naukri, and Internshala is in active development." },
];

function FAQ() {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <section style={{ padding: "80px 24px", fontFamily: "Inter,sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>FAQ</div>
          <h2 style={{ color: "#fff", fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 700 }}>Frequently Asked Questions</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQ_DATA.map((item, i) => (
            <FaqItem key={i} item={item} isOpen={openIdx === i} toggle={() => setOpenIdx(openIdx === i ? null : i)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ item, isOpen, toggle }) {
  return (
    <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <button onClick={toggle} style={{ width: "100%", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: "#fff", fontFamily: "Inter,sans-serif", fontSize: 16, fontWeight: 600, textAlign: "left" }}>
        {item.q}
        <div style={{ color: "#3b82f6", transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease" }}>
          <Icons.ChevronDown />
        </div>
      </button>
      <div style={{ maxHeight: isOpen ? 200 : 0, overflow: "hidden", transition: "all 0.3s ease" }}>
        <p style={{ padding: "0 24px 20px", color: "#6b7280", fontSize: 15, lineHeight: 1.65, margin: 0 }}>{item.a}</p>
      </div>
    </div>
  );
}

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inputBase = { width: "100%", background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 8, padding: "10px 14px", color: "#fff", fontFamily: "Inter,sans-serif", fontSize: 14, outline: "none", transition: "border-color 0.2s" };
  return (
    <section style={{ padding: "80px 24px", fontFamily: "Inter,sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>GET IN TOUCH</div>
          <h2 style={{ color: "#fff", fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 700, marginBottom: 10 }}>{"We\u2019re here to help"}</h2>
          <p style={{ color: "#6b7280" }}>Questions or feedback? Send us a message.</p>
        </div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: 32 }}>
          <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>Name</label>
              <input value={form.name} onChange={set("name")} placeholder="Your name" style={inputBase} onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; }} onBlur={(e) => { e.target.style.borderColor = "#1e1e1e"; }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>Email</label>
              <input value={form.email} onChange={set("email")} placeholder="Your email" type="email" style={inputBase} onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; }} onBlur={(e) => { e.target.style.borderColor = "#1e1e1e"; }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>Message</label>
              <textarea value={form.message} onChange={set("message")} placeholder="How can we help?" rows={4} style={{ ...inputBase, resize: "vertical" }} onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; }} onBlur={(e) => { e.target.style.borderColor = "#1e1e1e"; }} />
            </div>
            <button type="submit" style={{ width: "100%", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "12px 0", fontFamily: "Inter,sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => { e.target.style.background = "#2563eb"; }} onMouseLeave={(e) => { e.target.style.background = "#3b82f6"; }}>
              Send Message
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function FooterNav() {
  return (
    <div style={{ background: "#000", borderTop: "1px solid #111", padding: "28px 60px", fontFamily: "Inter,sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 18, fontWeight: 700 }}>
          <span style={{ color: "#3b82f6", marginRight: 2 }}>·</span>
          <span style={{ color: "#fff", fontWeight: 400 }}>Smart</span>
          <span style={{ color: "#3b82f6", fontWeight: 700 }}>Apply</span>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          <a href="#features" style={{ color: "#9ca3af", fontSize: 14, textDecoration: "none" }}>Features</a>
          <a href="#how-it-works" style={{ color: "#9ca3af", fontSize: 14, textDecoration: "none" }}>How it Works</a>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link to="/login" style={{ color: "#9ca3af", fontSize: 14, textDecoration: "none" }}>Login</Link>
          <Link to="/signup" style={{ background: "#3b82f6", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Get Started</Link>
        </div>
      </div>
    </div>
  );
}

function CTABanner() {
  const [ref, vis] = useReveal(0.15);
  const [hov, setHov] = useState(false);
  return (
    <section style={{ padding: "0 24px 0", fontFamily: "Inter,sans-serif" }}>
      <div ref={ref} style={{
        maxWidth: 1200, margin: "0 auto",
        background: "linear-gradient(135deg,#3b82f6 0%,#6366f1 50%,#8b5cf6 100%)",
        borderRadius: 24, padding: "80px 60px", textAlign: "center",
        opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(32px)",
        transition: "all 0.7s ease"
      }}>
        <h2 style={{ color: "#fff", fontSize: "clamp(1.6rem,3.5vw,2.2rem)", fontWeight: 800, marginBottom: 14 }}>Ready to automate your job search?</h2>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, marginBottom: 32 }}>Join thousands of candidates successfully landing jobs with AI</p>
        <Link to="/signup"
          onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          style={{
            display: "inline-block", background: "#fff", color: "#3b82f6", borderRadius: 8,
            padding: "12px 28px", fontWeight: 600, fontSize: 15, textDecoration: "none",
            transition: "transform 0.2s, box-shadow 0.2s",
            transform: hov ? "scale(1.03)" : "scale(1)",
            boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.2)" : "none"
          }}>
          Create Your Free Account
        </Link>
      </div>
      <div style={{ textAlign: "center", padding: "32px 0 24px", color: "#6b7280", fontSize: 12 }}>
        {"\u00a9"} {new Date().getFullYear()} SmartApply. All rights reserved.
        <span style={{ margin: "0 12px" }}>{"\u00b7"}</span>
        <a href="#" style={{ color: "#6b7280", textDecoration: "none" }}>Twitter</a>
        <span style={{ margin: "0 8px" }}>{"\u00b7"}</span>
        <a href="#" style={{ color: "#6b7280", textDecoration: "none" }}>Privacy</a>
      </div>
    </section>
  );
}

/* ─── Main Landing Page ─── */

export default function LandingPage() {
  useInjectStyles();

  return (
    <div style={{ background: "#000", color: "#fff", minHeight: "100vh", fontFamily: "Inter,sans-serif", overflowX: "hidden" }}>
      <TopBar />
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <Marquee />
      <FAQ />
      <Contact />
      <FooterNav />
      <CTABanner />
    </div>
  );
}
