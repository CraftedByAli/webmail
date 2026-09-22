'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Checkbox = React.forwardRef(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer border-line-strong bg-surface text-on-accent rounded-tight grid size-4 shrink-0 place-items-center border transition-colors duration-100',
        'hover:border-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center text-current">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
