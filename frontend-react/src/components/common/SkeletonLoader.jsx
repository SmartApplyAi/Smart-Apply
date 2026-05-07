export default function SkeletonLoader({ height = '44px', width = '100%', borderRadius = 'var(--radius-sm)', style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius, ...style }}
    />
  );
}
