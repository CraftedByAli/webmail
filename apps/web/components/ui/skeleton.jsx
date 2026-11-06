import { cn } from '@/utils/cn';

export function Skeleton({ className, ...props }) {
  return <div className={cn('bg-hover rounded-tight animate-pulse', className)} {...props} />;
}

/** Placeholder rows that match the real list rhythm, so loading does not jump. */
export function ListSkeleton({ rows = 12 }) {
  return (
    <div aria-busy="true" aria-label="Loading messages">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row-h border-line px-gutter flex items-center gap-3 border-b">
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className="h-3 w-32 shrink-0" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${30 + ((i * 37) % 45)}%` }} />
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
