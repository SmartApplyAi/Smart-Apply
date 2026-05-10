import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { WebSocketProvider } from './websocket/WebSocketProvider';

// Layouts
import ProtectedLayout from './layouts/ProtectedLayout';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import NotFoundPage from './pages/NotFoundPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';

// Protected Pages
import DashboardPage from './pages/DashboardPage';
import ResumePage from './pages/ResumePage';
import SettingsPage from './pages/SettingsPage';

import ProfilePage from './pages/ProfilePage';
import ATSPage from './pages/ATSPage';
import LinkedInOptimizerPage from './pages/LinkedInOptimizerPage';
import InterviewPrepPage from './pages/InterviewPrepPage';
import SkillGapPage from './pages/SkillGapPage';
import AdminPage from './pages/AdminPage';

import OrbLoader from './components/loader/OrbLoader';
import './App.css';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);
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

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      observer.disconnect();
      revealObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <WebSocketProvider>
              <OrbLoader isLoading={isLoading} />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/privacy.html" element={<PrivacyPolicyPage />} />

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
                <Route path="/interview-prep" element={<InterviewPrepPage />} />
                <Route path="/skill-gap" element={<SkillGapPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>

              {/* 404 Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </WebSocketProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
