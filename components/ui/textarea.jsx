import * as React from 'react';
import { cn } from '@/utils/cn';

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'border-input bg-surface placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
