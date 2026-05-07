import { useEffect, useState } from 'react';

export default function ScoreRing({ score = 0, size = 180, strokeWidth = 12, color = 'var(--primary)', label = 'Score' }) {
  const radius = (size / 2) - (strokeWidth / 2) - 6;
  const circumference = 2 * Math.PI * radius;
  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedOffset(circumference - (circumference * Math.min(score, 100) / 100));
    }, 100);
    return () => clearTimeout(timeout);
  }, [score, circumference]);

  const getGrade = () => {
    if (score >= 90) return { text: 'A+', color: '#30d158' };
    if (score >= 80) return { text: 'A', color: '#30d158' };
    if (score >= 70) return { text: 'B+', color: '#32d74b' };
    if (score >= 60) return { text: 'B', color: '#ffd60a' };
    if (score >= 50) return { text: 'C', color: '#ff9f0a' };
    return { text: 'D', color: '#ff453a' };
  };

  const grade = getGrade();

  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ width: size, height: size }}>
        {/* Glow effect behind the ring */}
        <div className="score-ring-glow" style={{
          position: 'absolute', inset: '10%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
          filter: 'blur(20px)',
          animation: 'scorePulse 3s ease-in-out infinite',
        }} />
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
          {/* Background track */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="var(--bg-3)" strokeWidth={strokeWidth}
            opacity="0.5"
          />
          {/* Animated score arc */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animatedOffset}
            style={{
              transition: 'stroke-dashoffset 1.5s cubic-bezier(.34,1.56,.64,1)',
              filter: `drop-shadow(0 0 8px ${color})`,
            }}
          />
        </svg>
        <div className="score-ring-label">
          <div className="score-number" style={{ fontSize: `${size * 0.22}px` }}>{score}</div>
          <div className="score-sub">{label}</div>
        </div>
      </div>
      <div className="score-grade-badge" style={{
        position: 'absolute', bottom: '-4px', right: '-4px',
        width: '40px', height: '40px', borderRadius: '50%',
        background: `linear-gradient(135deg, ${grade.color}, ${grade.color}cc)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: '14px',
        fontFamily: 'Syne, sans-serif',
        boxShadow: `0 4px 12px ${grade.color}44`,
        border: '3px solid var(--bg-2)',
        zIndex: 2,
      }}>
        {grade.text}
      </div>
      <style>{`
        .score-ring-wrap {
          display: flex; flex-direction: column; align-items: center;
          position: relative; width: fit-content; margin: 0 auto;
        }
        .score-ring {
          position: relative; display: flex; align-items: center; justify-content: center;
        }
        .score-ring-label {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 2;
        }
        .score-number {
          font-family: 'Syne', sans-serif; font-weight: 800;
          letter-spacing: -0.04em; line-height: 1;
          background: linear-gradient(135deg, var(--text), var(--text-2));
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .score-sub {
          font-size: 12px; color: var(--text-3);
          font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; margin-top: 4px;
        }
        @keyframes scorePulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
