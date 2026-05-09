import React, { useMemo } from 'react';
import './FloatingBackground.css';

const FloatingBackground = () => {
  const symbols = useMemo(() => [
    { icon: 'fa-linkedin', size: 24, top: '10%', left: '5%', delay: '0s', duration: '20s' },
    { icon: 'fa-briefcase', size: 18, top: '20%', left: '85%', delay: '-5s', duration: '25s' },
    { icon: 'fa-file-lines', size: 20, top: '70%', left: '15%', delay: '-2s', duration: '22s' },
    { icon: 'fa-chrome', size: 22, top: '40%', left: '90%', delay: '-8s', duration: '18s' },
    { icon: 'fa-paper-plane', size: 16, top: '85%', left: '75%', delay: '-12s', duration: '30s' },
    { icon: 'fa-bolt', size: 14, top: '15%', left: '45%', delay: '-3s', duration: '15s' },
    { icon: 'fa-magnifying-glass', size: 16, top: '60%', left: '60%', delay: '-15s', duration: '28s' },
    { icon: 'fa-graduation-cap', size: 20, top: '35%', left: '20%', delay: '-7s', duration: '24s' },
    { icon: 'fa-google', size: 18, top: '55%', left: '5%', delay: '-10s', duration: '21s' },
    { icon: 'fa-window-restore', size: 16, top: '80%', left: '40%', delay: '-4s', duration: '26s' },
  ], []);

  return (
    <div className="floating-background">
      {symbols.map((s, i) => (
        <div 
          key={i} 
          className="floating-symbol"
          style={{
            top: s.top,
            left: s.left,
            fontSize: `${s.size}px`,
            animationDelay: s.delay,
            animationDuration: s.duration
          }}
        >
          <i className={`${s.icon.includes('linkedin') || s.icon.includes('chrome') || s.icon.includes('google') || s.icon.includes('brands') ? 'fa-brands' : 'fa-solid'} ${s.icon}`}></i>
        </div>
      ))}
      <div className="glass-overlay"></div>
    </div>
  );
};

export default FloatingBackground;
