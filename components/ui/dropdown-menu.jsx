'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const itemClass =
  'relative flex cursor-default select-none items-center gap-2 rounded-control px-2 py-1.5 text-ui text-fg outline-none transition-colors duration-100 focus:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted';

const surfaceClass =
  'overlay-in z-50 min-w-44 overflow-y-auto overflow-x-hidden rounded-surface border border-line bg-surface p-1 text-fg shadow-overlay';

export const DropdownMenuSubTrigger = React.forwardRef(function DropdownMenuSubTrigger(
  { className, children, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(itemClass, 'data-[state=open]:bg-hover', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export const DropdownMenuSubContent = React.forwardRef(function DropdownMenuSubContent(
  { className, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(surfaceClass, className)}
      {...props}
    />
  );
});

export const DropdownMenuContent = React.forwardRef(function DropdownMenuContent(
  { className, sideOffset = 6, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(surfaceClass, 'max-h-[min(24rem,60vh)]', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef(function DropdownMenuItem(
  { className, inset, destructive, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        itemClass,
        inset && 'pl-8',
        destructive && 'text-danger focus:bg-danger-subtle focus:text-danger [&_svg]:text-danger',
        className
      )}
      {...props}
    />
  );
});

export const DropdownMenuCheckboxItem = React.forwardRef(function DropdownMenuCheckboxItem(
  { className, children, checked, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(itemClass, 'pl-7', className)}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 grid size-3.5 place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="text-accent-text size-3.5" strokeWidth={2.5} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = React.forwardRef(function DropdownMenuRadioItem(
  { className, children, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(itemClass, 'pl-7', className)}
      {...props}
    >
      <span className="absolute left-2 grid size-3.5 place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="text-accent-text size-3.5" strokeWidth={2.5} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

export const DropdownMenuLabel = React.forwardRef(function DropdownMenuLabel(
  { className, inset, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        'text-meta text-fg-muted px-2 pt-1.5 pb-1 font-semibold tracking-wide uppercase',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef(function DropdownMenuSeparator(
  { className, ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('bg-line -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
});

export function DropdownMenuShortcut({ className, ...props }) {
  return <span className={cn('text-meta text-fg-muted ml-auto pl-3', className)} {...props} />;
}
