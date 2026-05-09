import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Menu, Sun, Moon, MonitorCog } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './Navbar.css';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

/* ─── Landing Navbar ─── */
function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const themeIcon =
    theme === 'dark'  ? <Moon size={16} /> :
    theme === 'light' ? <Sun size={16} />  :
                        <MonitorCog size={16} />;

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 30);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <motion.nav
      className={`landing-nav ${scrolled ? 'landing-nav--scrolled' : ''}`}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="landing-nav__inner">
        {/* Logo */}
        <a href="#" className="landing-nav__logo" onClick={closeMobile}>
          <span className="landing-nav__logo-dot" />
          Smart<span className="landing-nav__logo-accent">Apply</span>
        </a>

        {/* Desktop Links */}
        <ul className="landing-nav__links">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="landing-nav__link">
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop Actions */}
        <div className="landing-nav__actions">
          <button
            className="landing-nav__theme-btn"
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
            onClick={toggleTheme}
          >
            {themeIcon}
          </button>
          <Link to="/login" className="landing-nav__login">
            Login
          </Link>
          <Link to="/signup" className="landing-nav__cta">
            Get Started <ArrowRight size={14} />
          </Link>
        </div>

        {/* Hamburger */}
        <button
          className={`landing-nav__hamburger ${mobileOpen ? 'landing-nav__hamburger--open' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="landing-nav__mobile landing-nav__mobile--open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.label}
                href={link.href}
                className="landing-nav__mobile-link"
                onClick={closeMobile}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              >
                {link.label}
              </motion.a>
            ))}
            <Link
              to="/login"
              className="landing-nav__mobile-link"
              onClick={closeMobile}
              style={{ color: '#A1A1AA', fontSize: '22px' }}
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="landing-nav__cta"
              onClick={closeMobile}
              style={{ fontSize: '18px', padding: '14px 32px', marginTop: '8px' }}
            >
              Get Started <ArrowRight size={16} />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/* ─── Protected Navbar (Dashboard / Authenticated) ─── */
function ProtectedNavbar({ onMenuClick }) {
  const { theme, toggleTheme } = useTheme();

  const themeIcon =
    theme === 'dark'  ? <Moon size={18} /> :
    theme === 'light' ? <Sun size={18} />  :
                        <MonitorCog size={18} />;

  return (
    <nav className="navbar" id="protected-navbar">
      <div className="container">
        <Link to="/dashboard" className="nav-logo">
          <span className="logo-dot" />
          <span className="nav-text">Smart<span>Apply</span></span>
        </Link>

        <div className="nav-links">
          <button
            className="btn btn-ghost btn-sm"
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
            onClick={toggleTheme}
            id="theme-toggle"
          >
            {themeIcon}
          </button>
        </div>

        {/* Mobile hamburger for sidebar */}
        <button
          className="nav-toggle"
          aria-label="Open sidebar"
          onClick={onMenuClick}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}

/* ─── Navbar Dispatcher ─── */
export default function Navbar({ variant, onMenuClick }) {
  if (variant === 'protected') {
    return <ProtectedNavbar onMenuClick={onMenuClick} />;
  }
  return <LandingNavbar />;
}
