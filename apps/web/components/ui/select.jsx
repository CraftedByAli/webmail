'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef(function SelectTrigger(
  { className, children, ...props },
  ref
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'border-line-strong bg-surface text-ui text-fg rounded-control flex h-8 w-full items-center justify-between gap-2 border px-2.5 transition-colors duration-100',
        'hover:bg-hover focus-visible:border-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-[-1px]',
        'disabled:cursor-not-allowed disabled:opacity-45 [&>span]:line-clamp-1 [&>span]:text-left',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="text-fg-muted size-3.5 shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef(function SelectContent(
  { className, children, position = 'popper', ...props },
  ref
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          'overlay-in border-line bg-surface text-fg shadow-overlay rounded-surface relative z-50 max-h-80 min-w-[8rem] overflow-hidden border',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef(function SelectItem(
  { className, children, ...props },
  ref
) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'text-ui focus:bg-hover rounded-control relative flex w-full cursor-default items-center py-1.5 pr-2 pl-7 transition-colors duration-100 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-3.5 place-items-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="text-accent-text size-3.5" strokeWidth={2.5} />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
