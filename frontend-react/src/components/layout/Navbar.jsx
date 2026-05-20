import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Menu, Sun, Moon, MonitorCog, Bell } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const dropdownRef = useRef(null);

  const themeIcon =
    theme === 'dark'  ? <Moon size={18} /> :
    theme === 'light' ? <Sun size={18} />  :
                        <MonitorCog size={18} />;

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await api.get('/notifications/unread-count');
      setUnreadCount(data.count || 0);
    } catch { /* silent */ }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  // Fetch recent notifications when dropdown opens
  const openDropdown = async () => {
    setShowDropdown(true);
    setNotifsLoading(true);
    try {
      const data = await api.get('/notifications?limit=8');
      setNotifications(data.notifications || []);
    } catch { /* silent */ }
    finally { setNotifsLoading(false); }
  };

  const toggleDropdown = () => {
    if (showDropdown) {
      setShowDropdown(false);
    } else {
      openDropdown();
    }
  };

  // Mark all read
  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* silent */ }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Time ago helper
  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <nav className="navbar" id="protected-navbar">
      <div className="container">
        <Link to="/dashboard" className="nav-logo">
          <span className="logo-dot" />
          <span className="nav-text">Smart<span>Apply</span></span>
        </Link>

        <div className="nav-links">
          {/* Notification Bell */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Notifications"
              title="Notifications"
              onClick={toggleDropdown}
              id="notification-bell"
              style={{ position: 'relative' }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '2px', right: '2px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: '#ef4444', color: '#fff', fontSize: '10px',
                  fontWeight: 700, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', lineHeight: 1,
                  border: '2px solid var(--bg)',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {showDropdown && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                width: '340px', maxHeight: '420px', overflowY: 'auto',
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                zIndex: 1000, animation: 'fadeIn 0.2s ease',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifsLoading ? (
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <div className="loader-spin" style={{ width: '24px', height: '24px', margin: '0 auto' }}></div>
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)' }}>
                    <Bell size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                    <p style={{ fontSize: '13px' }}>No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      background: n.read ? 'transparent' : 'rgba(79,124,255,0.04)',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(79,124,255,0.04)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%', marginTop: '6px', flexShrink: 0,
                          background: n.read ? 'transparent' : '#4f7cff',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{n.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.4,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>{n.message}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Theme toggle */}
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
