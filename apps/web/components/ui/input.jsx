import * as React from 'react';
import { cn } from '@/utils/cn';

export const Input = React.forwardRef(function Input(
  { className, type = 'text', invalid, ...props },
  ref
) {
  return (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'border-line-strong bg-surface text-ui text-fg rounded-control h-8 w-full border px-2.5 transition-colors duration-100',
        'placeholder:text-fg-muted',
        'focus-visible:border-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-[-1px]',
        'disabled:bg-sunken disabled:text-fg-muted disabled:cursor-not-allowed',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger',
        className
      )}
      {...props}
    />
  );
});
