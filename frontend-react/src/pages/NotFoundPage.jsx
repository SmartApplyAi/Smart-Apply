import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <>
      <div className="bg-grid"></div>
      <div className="bg-glow bg-glow-1"></div>
      <nav className="navbar">
        <div className="container">
          <Link to="/" className="nav-logo">
            <div className="logo-dot"></div>Smart<span>Apply</span>
          </Link>
        </div>
      </nav>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(5rem, 15vw, 9rem)', fontWeight: 800, color: 'var(--surface-2)', lineHeight: 1, marginBottom: '8px' }}>404</div>
          <h2 style={{ marginBottom: '12px' }}>Page not found</h2>
          <p style={{ color: 'var(--text-2)', marginBottom: '32px' }}>The page you are looking for does not exist or was moved.</p>
          <Link to="/" className="btn btn-primary btn-lg">
            <i className="fa-solid fa-house"></i> Go Home
          </Link>
        </div>
      </div>
    </>
  );
}
