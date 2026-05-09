import './LogoMarquee.css';

const BRANDS = [
  { 
    name: 'LinkedIn', 
    color: '#0A66C2', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    )
  },
  { 
    name: 'Naukri', 
    color: '#4A90D9', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-4H7.5L13 6.5v4h3.5L11 17.5z"/>
      </svg>
    )
  },
  { 
    name: 'Indeed', 
    color: '#2164F3', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M11.566 21.552v-8.712c0-.146-.07-.22-.22-.22H9.14c-.146 0-.22.074-.22.22v8.712c0 .15.074.22.22.22h2.206c.15 0 .22-.07.22-.22zm.22-11.628c0-.82-.66-1.48-1.48-1.48-.82 0-1.48.66-1.48 1.48 0 .82.66 1.48 1.48 1.48.82 0 1.48-.66 1.48-1.48zM14.4 2.448c2.08.68 3.6 1.88 4.68 3.52.36.56.68 1.16.92 1.8.08.2.04.28-.16.36-.72.28-1.44.56-2.16.84-.16.08-.24.04-.32-.12-.48-1.04-1.16-1.92-2.12-2.6-1.28-.92-2.72-1.28-4.28-1.2-1.04.08-2.04.32-2.96.84-1.6.88-2.64 2.2-3.16 3.92-.44 1.44-.48 2.92-.2 4.4.32 1.68 1.12 3.08 2.44 4.12 1.04.84 2.24 1.28 3.56 1.4 1.36.12 2.64-.12 3.84-.72.92-.48 1.68-1.12 2.28-1.96.08-.12.16-.16.28-.08l2.04 1.28c.12.08.12.16.04.28-.72 1.04-1.6 1.88-2.64 2.56-1.4.88-2.92 1.36-4.56 1.48-1.84.12-3.6-.2-5.24-1.04-1.88-1-3.2-2.48-4-4.44-.68-1.64-.88-3.36-.68-5.12.24-1.88.96-3.56 2.16-5 1.32-1.6 3-2.68 5.04-3.24 1.56-.44 3.12-.52 4.72-.16l.2.08z"/>
      </svg>
    )
  },
  { 
    name: 'Internshala', 
    color: '#00A5EC', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    )
  },
  { 
    name: 'Glassdoor', 
    color: '#0CAA41', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M17.14 2C17.14 0.895 16.245 0 15.14 0H2.86C2.385 0 2 0.385 2 0.86s0.385 0.86 0.86 0.86h12.28v17.42H2.86c-0.475 0-0.86 0.385-0.86 0.86 0 1.105 0.895 2 2 2h12.28c1.105 0 2-0.895 2-2V2zM6.86 4.72c-1.105 0-2 0.895-2 2v15.28c0 1.105 0.895 2 2 2h12.28c0.475 0 0.86-0.385 0.86-0.86s-0.385-0.86-0.86-0.86H6.86V4.72h12.28c0.475 0 0.86-0.385 0.86-0.86s-0.385-0.86-0.86-0.86H6.86z"/>
      </svg>
    )
  },
  { 
    name: 'Foundit', 
    color: '#6E45A5', 
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    )
  },
];

export default function LogoMarquee() {
  /* Duplicate enough for seamless loop */
  const items = [...BRANDS, ...BRANDS, ...BRANDS, ...BRANDS];

  return (
    <section className="marquee">
      <div className="marquee__heading">
        <span className="marquee__heading-label">Trusted Platforms</span>
        <h3 className="marquee__heading-title">
          Works with the platforms you <span className="landing-text-gradient">love</span>
        </h3>
      </div>
      <div className="marquee__track-wrapper">
        <div className="marquee__track">
          {items.map((brand, i) => (
            <div
              key={i}
              className="marquee__item"
              style={{
                '--brand-color': brand.color,
                '--brand-bg': `${brand.color}14`,
                '--brand-border': `${brand.color}30`,
              }}
            >
              <span className="marquee__item-icon">{brand.icon}</span>
              <span className="marquee__item-name">{brand.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
