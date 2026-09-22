import { cn } from '@/utils/cn';

export function Kbd({ className, children }) {
  return (
    <kbd
      className={cn(
        'border-border bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1.5 font-mono text-[11px] font-medium',
        className
      )}
    >
      {children}
    </kbd>
  );
}
