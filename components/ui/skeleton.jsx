import { cn } from '@/utils/cn';

export function Skeleton({ className, ...props }) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}
