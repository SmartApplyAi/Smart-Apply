export default function StatCard({ label, value, sub, valueColor, className = '' }) {
  return (
    <div className={`stat-card fade-in ${className}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
