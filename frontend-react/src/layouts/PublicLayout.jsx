import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/common/ThemeToggle';

export default function PublicLayout({ guestOnly = false }) {
  const { isAuthenticated } = useAuth();

  // If guestOnly, redirect authenticated users to dashboard
  if (guestOnly && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <div className="bg-grid"></div>
      <div className="bg-glow bg-glow-1"></div>
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 999 }}>
        <ThemeToggle />
      </div>
      <Outlet />
    </>
  );
}
