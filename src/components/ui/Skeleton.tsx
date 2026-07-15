// Скелетоны загрузки (правило проекта: не спиннеры — animate-pulse). Чистые
// презентационные компоненты.

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span style={style} className={`block animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export function SkeletonLine({ w = 'w-full' }: { w?: string }) {
  return <Skeleton className={`h-4 ${w}`} />;
}

export function SkeletonCard() {
  return (
    <div className="overflow-hidden">
      <Skeleton className="aspect-[4/5] w-full rounded-media" />
      <div className="mt-3 flex flex-col gap-2">
        <SkeletonLine w="w-2/3" />
        <SkeletonLine w="w-1/3" />
      </div>
    </div>
  );
}

export function SkeletonFeed({ count = 9 }: { count?: number }) {
  return (
    <div className="columns-2 gap-2 sm:columns-3 md:columns-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="mb-2 w-full" style={{ height: `${120 + (i % 4) * 40}px` }} />
      ))}
    </div>
  );
}
