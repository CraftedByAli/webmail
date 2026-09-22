'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/utils/cn';

export const Switch = React.forwardRef(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'rounded-pill bg-line-strong inline-flex h-[18px] w-8 shrink-0 items-center border border-transparent p-0.5 transition-colors duration-100',
        'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="rounded-pill size-3.5 bg-white transition-transform duration-100 ease-out data-[state=checked]:translate-x-3.5" />
    </SwitchPrimitive.Root>
  );
});
