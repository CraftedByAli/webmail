'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/utils/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef(function PopoverContent(
  { className, align = 'center', sideOffset = 6, ...props },
  ref
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'overlay-in border-line bg-surface text-fg shadow-overlay rounded-surface z-50 w-72 border p-3 outline-none',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
