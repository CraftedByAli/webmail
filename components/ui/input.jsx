import * as React from 'react';
import { cn } from '@/utils/cn';

export const Input = React.forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'border-input bg-surface placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 flex h-10 w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
