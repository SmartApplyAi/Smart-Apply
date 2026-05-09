export default function FloatingGlow({
  color = 'rgba(59,130,246,0.12)',
  size = 300,
  top,
  left,
  right,
  bottom,
  blur = 80,
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
