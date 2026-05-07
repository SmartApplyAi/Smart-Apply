import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ activeTab, onTabChange, userName, userEmail }) {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();

  const closeSidebar = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = '';
  }, []);

  const toggleSidebar = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      document.body.style.overflow = next ? 'hidden' : '';
      return next;
    });
  }, []);

  const handleTabClick = (tab) => {
    if (onTabChange) onTabChange(tab);
    closeSidebar();
  };

  return (
    <>
      {/* Mobile hamburger button — rendered inside Navbar area */}
      <button className="mobile-sidebar-btn" onClick={toggleSidebar} aria-label="Open menu">
        <i className="fa-solid fa-bars"></i> <span className="hide-on-xs">Menu</span>
      </button>

      {/* Overlay */}
      <div
        className={`sidebar-overlay${open ? ' open' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
        <div style={{ padding: '0 12px', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>{userName || 'Loading…'}</div>
          <div className="text-muted text-sm">{userEmail || ''}</div>
        </div>

        <div className="sidebar-section-label">Navigation</div>
        <button
          className={`sidebar-link${activeTab === 'overview' ? ' active' : ''}`}
          onClick={() => handleTabClick('overview')}
        >
          <span className="icon"><i className="fa-solid fa-gauge"></i></span> Overview
        </button>
        <button
          className={`sidebar-link${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => handleTabClick('history')}
        >
          <span className="icon"><i className="fa-solid fa-list-check"></i></span> Applications
        </button>
        <button
          className={`sidebar-link${activeTab === 'extension' ? ' active' : ''}`}
          onClick={() => handleTabClick('extension')}
        >
          <span className="icon"><i className="fa-brands fa-chrome"></i></span> Extension
        </button>

        <div className="sidebar-section-label">Tools</div>
        <Link to="/ats" className="sidebar-link" style={{ textDecoration: 'none' }}>
          <span className="icon"><i className="fa-solid fa-bullseye"></i></span> ATS Analyzer
        </Link>
        <Link to="/linkedin-optimizer" className="sidebar-link" style={{ textDecoration: 'none' }}>
          <span className="icon"><i className="fa-brands fa-linkedin"></i></span> LinkedIn Optimizer
        </Link>
        <Link to="/resume" className="sidebar-link" style={{ textDecoration: 'none' }}>
          <span className="icon"><i className="fa-solid fa-file-lines"></i></span> Resumes
        </Link>

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-section-label">Management</div>
            <Link to="/admin" className="sidebar-link" style={{ textDecoration: 'none' }}>
              <span className="icon"><i className="fa-solid fa-user-shield"></i></span> Admin Panel
            </Link>
          </>
        )}

        <div className="sidebar-section-label">Account</div>
        <Link to="/profile" className="sidebar-link" style={{ textDecoration: 'none' }}>
          <span className="icon"><i className="fa-solid fa-user-pen"></i></span> Edit Profile
        </Link>
        <Link to="/settings" className="sidebar-link" style={{ textDecoration: 'none' }}>
          <span className="icon"><i className="fa-solid fa-gear"></i></span> Settings
        </Link>
        <button className="sidebar-link" onClick={logout}>
          <span className="icon"><i className="fa-solid fa-right-from-bracket"></i></span> Logout
        </button>
      </aside>
    </>
  );
}
