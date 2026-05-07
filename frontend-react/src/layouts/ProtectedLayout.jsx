import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';

export default function ProtectedLayout() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Define which paths should use the dashboard (sidebar) layout
  const isDashboardPath = ['/dashboard', '/admin', '/history', '/extension', '/ats', '/linkedin-optimizer'].some(p => location.pathname.startsWith(p));
  
  // Get active tab from path
  const activeTab = location.pathname.split('/').filter(Boolean).pop() || 'overview';

  return (
    <>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>
      <div className="ambient-glow"></div>
      <div className="bg-grid"></div>
      <Navbar variant="protected" onMenuClick={() => setIsSidebarOpen(true)} />
      <div className="page-wrapper">
        {isDashboardPath ? (
          <div className="dashboard-layout">
            <Sidebar 
              activeTab={activeTab} 
              isOpen={isSidebarOpen} 
              onClose={() => setIsSidebarOpen(false)}
              userName={user?.email?.split('@')[0]}
              userEmail={user?.email}
            />
            <main className="main-content">
              <Outlet />
            </main>
          </div>
        ) : (
          <div className="container" style={{ paddingTop: '40px', paddingBottom: '60px' }}>
            <Outlet />
          </div>
        )}
      </div>
    </>
  );
}
