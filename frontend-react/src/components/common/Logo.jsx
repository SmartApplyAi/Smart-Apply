import { Link } from 'react-router-dom';

export default function Logo({ as = 'link', className = '' }) {
  const inner = (
    <>
      <div className="logo-dot"></div>
      Smart<span>Apply</span>
    </>
  );

  if (as === 'div') {
    return <div className={`logo ${className}`}>{inner}</div>;
  }

  return (
    <Link to="/" className={`nav-logo ${className}`}>
      {inner}
    </Link>
  );
}
