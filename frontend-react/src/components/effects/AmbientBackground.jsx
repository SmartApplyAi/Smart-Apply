import { memo } from 'react';

const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {/* Primary blue blob — top left */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-5%',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          animation: 'ambientDrift1 25s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Purple blob — top right */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          animation: 'ambientDrift2 30s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Blue blob — center */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '30%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)',
          animation: 'ambientDrift3 20s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Bottom accent */}
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.04) 0%, transparent 60%)',
        }}
      />
    </div>
  );
});

export default AmbientBackground;
