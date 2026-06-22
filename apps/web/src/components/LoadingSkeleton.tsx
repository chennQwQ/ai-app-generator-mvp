export function LoadingSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="loading-skeleton" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
