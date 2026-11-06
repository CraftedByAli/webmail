import * as React from 'react';
import { cn } from '@/utils/cn';

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'border-line-strong bg-surface text-ui text-fg rounded-control min-h-16 w-full border px-2.5 py-1.5 transition-colors duration-100',
        'placeholder:text-fg-muted',
        'focus-visible:border-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-[-1px]',
        'disabled:bg-sunken disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  );
});
