import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

// Layouts
import ProtectedLayout from './layouts/ProtectedLayout';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import NotFoundPage from './pages/NotFoundPage';

// Protected Pages
import DashboardPage from './pages/DashboardPage';
import ResumePage from './pages/ResumePage';
import SettingsPage from './pages/SettingsPage';

import ProfilePage from './pages/ProfilePage';
import ATSPage from './pages/ATSPage';
import LinkedInOptimizerPage from './pages/LinkedInOptimizerPage';
import AdminPage from './pages/AdminPage';

import './App.css';



function SiteLoader() {
  return (
    <div className="site-loader" style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', animation: 'fadeOut 0.5s ease forwards 1.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        <svg style={{ width: '64px', height: '64px', color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 1L14.85 8.15L22 11L14.85 13.85L12 21L9.15 13.85L2 11L9.15 8.15L12 1Z" fill="currentColor" />
        </svg>
        <div style={{ fontFamily: 'Syne', fontSize: '60px', fontWeight: 800, letterSpacing: '-0.05em' }}>
          Smart<span style={{ color: 'var(--primary)' }}>Apply</span>
        </div>
      </div>
      <style>{`
        @keyframes fadeOut { to { opacity: 0; visibility: hidden; } }
      `}</style>
    </div>
  );
}

function App() {
  useEffect(() => {
    // ── Reveal & Fade Observer ──
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          
          // Counter Logic
          if (entry.target.classList.contains('stat-count') || entry.target.classList.contains('stat-value')) {
            const el = entry.target;
            const targetValue = parseInt(el.textContent.replace(/[^0-9]/g, ''));
            if (!isNaN(targetValue) && targetValue > 0) {
              const duration = 2000;
              const start = Date.now();
              const step = () => {
                const progress = Math.min((Date.now() - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 4);
                el.textContent = Math.floor(eased * targetValue).toLocaleString();
                if (progress < 1) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            }
          }
          
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });

    // ── Mouse Interactivity ──

    const handleMouseMove = (e) => {
      // Card Glow
      const card = e.target.closest('.card');
      if (card) {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);
      }

      // Magnetic Buttons
      const btn = e.target.closest('.btn-primary');
      if (btn && !btn.disabled && !btn.classList.contains('loading')) {
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) * 0.2;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.2;
        btn.style.transform = `translate(${x}px, ${y}px) scale(1.02)`;
        
        if (!btn.dataset.magnetic) {
          btn.dataset.magnetic = 'true';
          const reset = () => {
            btn.style.transform = '';
            btn.dataset.magnetic = '';
            btn.removeEventListener('pointerleave', reset);
          };
          btn.addEventListener('pointerleave', reset);
        }
      }
    };

    const observer = new MutationObserver(() => {
      const elements = document.querySelectorAll('.reveal, .fade-in, .stagger > *, .card, .stat-card, .stat-count, .stat-value');
      elements.forEach(el => {
        if (!el.classList.contains('active')) {
          revealObserver.observe(el);
        }
      });
    });

    const handleScroll = () => {
      const nav = document.querySelector('.navbar');
      if (nav) {
        if (window.scrollY > 20) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
      }
    };

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      revealObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <SiteLoader />

            <div className="ambient-glow"></div>
            <div className="blob blob-1"></div>
            <div className="blob blob-2"></div>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />

              {/* Protected Routes */}
              <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/history" element={<DashboardPage />} />
                <Route path="/extension" element={<DashboardPage />} />
                <Route path="/resume" element={<ResumePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/ats" element={<ATSPage />} />
                <Route path="/linkedin-optimizer" element={<LinkedInOptimizerPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>

              {/* 404 Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
