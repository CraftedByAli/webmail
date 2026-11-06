'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * One button family. Variant communicates intent, size communicates density —
 * never the other way round. Exactly one `primary` button should be visible in
 * any given view.
 */
export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,opacity] duration-100 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover',
        default: 'border border-line-strong bg-surface text-fg hover:bg-hover',
        subtle: 'bg-accent-subtle text-accent-text hover:bg-accent-subtle-strong',
        ghost: 'text-fg-secondary hover:bg-hover hover:text-fg',
        danger: 'bg-danger text-on-danger hover:bg-danger-hover',
        'danger-ghost': 'text-danger hover:bg-danger-subtle',
        link: 'text-accent-text underline underline-offset-2 hover:text-accent-hover',
      },
      size: {
        xs: 'h-6 px-2 text-meta [&_svg]:size-3.5',
        sm: 'h-7 px-2.5 text-ui [&_svg]:size-4',
        md: 'h-8 px-3 text-ui [&_svg]:size-4',
        lg: 'h-9 px-4 text-body [&_svg]:size-4',
        icon: 'h-8 w-8 [&_svg]:size-4',
        'icon-sm': 'h-7 w-7 [&_svg]:size-4',
        'icon-xs': 'h-6 w-6 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

export const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, loading = false, children, ...props },
  ref
) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
