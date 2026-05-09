import ScrollReveal from '../effects/ScrollReveal';

export default function SectionHeading({
  label,
  title,
  description,
  align = 'center',
}) {
  return (
    <ScrollReveal
      style={{
        textAlign: align,
        marginBottom: 'clamp(40px, 6vw, 64px)',
        maxWidth: align === 'center' ? '640px' : 'none',
        marginLeft: align === 'center' ? 'auto' : undefined,
        marginRight: align === 'center' ? 'auto' : undefined,
      }}
    >
      {label && (
        <div
          style={{
            display: 'inline-block',
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#3B82F6',
            marginBottom: '16px',
            padding: '6px 14px',
            borderRadius: '9999px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
          }}
        >
          {label}
        </div>
      )}
      <h2
        style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          marginBottom: description ? '16px' : 0,
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            fontSize: '16px',
            lineHeight: 1.7,
            color: '#A1A1AA',
            maxWidth: '520px',
            marginLeft: align === 'center' ? 'auto' : undefined,
            marginRight: align === 'center' ? 'auto' : undefined,
          }}
        >
          {description}
        </p>
      )}
    </ScrollReveal>
  );
}
