import './LogoMarquee.css';

const BRANDS = [
  'LinkedIn',
  'Indeed',
  'Glassdoor',
  'Naukri',
  'Google Jobs',
  'Internshala',
  'ZipRecruiter',
  'AngelList',
  'Dice',
  'Monster',
  'CareerBuilder',
  'SimplyHired',
];

export default function LogoMarquee() {
  const items = [...BRANDS, ...BRANDS];

  return (
    <section className="marquee">
      <div className="marquee__track">
        {items.map((brand, i) => (
          <span key={i} className="marquee__item">
            <span className="marquee__item-dot" />
            {brand}
          </span>
        ))}
      </div>
    </section>
  );
}
