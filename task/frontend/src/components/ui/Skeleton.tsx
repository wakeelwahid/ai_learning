export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
        </div>
      </div>
      <SkeletonLine />
      <SkeletonLine className="w-4/5" />
    </div>
  );
}

export function SkeletonCardGrid({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-${count > 2 ? "3" : "2"} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonList({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
