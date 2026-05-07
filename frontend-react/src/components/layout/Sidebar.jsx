import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ activeTab, isOpen, onClose, userName, userEmail }) {
  const { logout, user } = useAuth();

  return (
    <>
      {/* Overlay */}
      <div
        className={`sidebar-overlay${isOpen ? ' open' : ''}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside className={`sidebar${isOpen ? ' open' : ''}`} id="sidebar">
        <div style={{ padding: '0 12px', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>{userName || 'Loading…'}</div>
          <div className="text-muted text-sm">{userEmail || ''}</div>
        </div>

        <div className="sidebar-section-label">Navigation</div>
        <Link
          to="/dashboard"
          className={`sidebar-link${activeTab === 'dashboard' || activeTab === 'overview' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-solid fa-gauge"></i></span> Overview
        </Link>
        
        <div className="sidebar-section-label">Tools</div>
        <Link 
          to="/ats" 
          className={`sidebar-link${activeTab === 'ats' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-solid fa-bullseye"></i></span> ATS Analyzer
        </Link>
        <Link 
          to="/linkedin-optimizer" 
          className={`sidebar-link${activeTab === 'linkedin-optimizer' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-brands fa-linkedin"></i></span> LinkedIn Optimizer
        </Link>
        <Link 
          to="/resume" 
          className={`sidebar-link${activeTab === 'resume' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-solid fa-file-lines"></i></span> Resumes
        </Link>

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-section-label">Management</div>
            <Link 
              to="/admin" 
              className={`sidebar-link${activeTab === 'admin' ? ' active' : ''}`}
              onClick={onClose}
            >
              <span className="icon"><i className="fa-solid fa-user-shield"></i></span> Admin Panel
            </Link>
          </>
        )}

        <div className="sidebar-section-label">Account</div>
        <Link 
          to="/profile" 
          className={`sidebar-link${activeTab === 'profile' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-solid fa-user-pen"></i></span> Edit Profile
        </Link>
        <Link 
          to="/settings" 
          className={`sidebar-link${activeTab === 'settings' ? ' active' : ''}`}
          onClick={onClose}
        >
          <span className="icon"><i className="fa-solid fa-gear"></i></span> Settings
        </Link>
        <button className="sidebar-link" onClick={logout}>
          <span className="icon"><i className="fa-solid fa-right-from-bracket"></i></span> Logout
        </button>
      </aside>
    </>
  );
}
