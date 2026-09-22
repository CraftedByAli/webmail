import { cn } from '@/utils/cn';

export function Kbd({ className, children }) {
  return (
    <kbd
      className={cn(
        'border-line-strong bg-sunken text-meta text-fg-muted rounded-tight inline-flex h-4 min-w-4 items-center justify-center border px-1 font-sans font-medium',
        className
      )}
    >
      {children}
    </kbd>
  );
}
