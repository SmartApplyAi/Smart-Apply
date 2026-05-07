import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Logo from '../common/Logo';
import ThemeToggle from '../common/ThemeToggle';

export default function Navbar({ variant = 'default' }) {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  if (variant === 'landing') {
    return (
      <nav className="navbar">
        <div className="container">
          <Logo />
          <div className="nav-links" id="nav-actions">
            <ThemeToggle />
            <a href="#features" className="btn btn-ghost btn-sm hide-mobile">Features</a>
            <a href="#how-it-works" className="btn btn-ghost btn-sm hide-mobile">How it Works</a>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-sm">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
                <Link to="/signup" className="btn btn-primary btn-sm">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>
    );
  }

  // Protected pages navbar
  return (
    <nav className="navbar">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo />
        </div>
        <div className="nav-links" id="nav-actions">
          <ThemeToggle />
          <Link to="/dashboard" className={`btn btn-ghost btn-sm ${isActive('/dashboard')}`}>
            <i className="fa-solid fa-gauge"></i> Dashboard
          </Link>
          <Link to="/resume" className={`btn btn-ghost btn-sm ${isActive('/resume')}`}>
            <i className="fa-solid fa-file-arrow-up"></i> Resumes
          </Link>
          <Link to="/ats" className={`btn btn-ghost btn-sm ${isActive('/ats')}`}>
            <i className="fa-solid fa-chart-simple"></i> ATS
          </Link>
          <Link to="/linkedin-optimizer" className={`btn btn-ghost btn-sm ${isActive('/linkedin-optimizer')}`}>
            <i className="fa-brands fa-linkedin"></i> LinkedIn Optimizer
          </Link>
          <Link to="/profile" className={`btn btn-ghost btn-sm ${isActive('/profile')}`}>
            <i className="fa-solid fa-user"></i> Profile
          </Link>
          <Link to="/settings" className={`btn btn-ghost btn-sm ${isActive('/settings')}`}>
            <i className="fa-solid fa-gear"></i> Settings
          </Link>
          <button onClick={logout} className="btn btn-ghost btn-sm">
            <i className="fa-solid fa-right-from-bracket"></i> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
